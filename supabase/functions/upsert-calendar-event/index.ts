// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Nylas from 'nylas'
import {serve} from "https://deno.land/std@0.168.0/http/server.ts"
import {timingSafeEqual} from "https://deno.land/std@0.168.0/crypto/timing_safe_equal.ts"
import {createClient} from 'supabase-js'

const NylasConfig = {
  apiKey: Deno.env.get("NYLAS_API_KEY") as string,
  apiUri: Deno.env.get("NYLAS_API_URI") as string,
};

// @ts-expect-error no-call-signatures
const nylas = new Nylas(NylasConfig);

// HT-1: each job is pushed to the calendar of the user who created it
// (jobs.created_by -> email_integrations, written by calendar-connect).
//
// NYLAS_GRANT_ID / NYLAS_CALENDAR_ID are now only a fallback, used for jobs
// whose creator has not connected a calendar (and for rows created before
// created_by existed, where it is NULL). Unset them once everyone has
// connected and such jobs will simply not be synced.
const FALLBACK_GRANT_ID = Deno.env.get("NYLAS_GRANT_ID") || null;
const FALLBACK_CALENDAR_ID = Deno.env.get("NYLAS_CALENDAR_ID") || null;

// standard corsHeaders
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// This function is called by a database webhook on the jobs table, not by a
// user, so there is no session to check. The webhook is configured (Database ->
// Webhooks on the self-hosted dashboard) to send
//   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
// and only that exact token is accepted. The gateway's JWT check alone is not
// enough: the anon key passes it too, and the anon key is public.
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

// The service-role client is used for the reads and the calendar_event_id
// write-back. Those used to go through the anon client and so depended on the
// permissive row-level security policies that HT-14 is closing.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") as string,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const encoder = new TextEncoder();

// Constant-time comparison so response timing does not leak how much of the
// token matched.
const isServiceRoleToken = (authHeader: string): boolean =>
  timingSafeEqual(
    encoder.encode(authHeader.slice("Bearer ".length)),
    encoder.encode(SUPABASE_SERVICE_ROLE_KEY),
  );

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Which Nylas grant and calendar a job's events live on.
type CalendarTarget = {
  grantId: string;
  calendarId: string;
  // The owning user when the target came from email_integrations; null for
  // the shared fallback calendar.
  userId: string | null;
};

serve(async (req) => {
  try {
    // Check if the request method is OPTIONS (CORS preflight)
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    // Check if the request method is POST
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Only the database webhook may call this; see the note on
    // SUPABASE_SERVICE_ROLE_KEY above.
    const authHeader = req.headers.get("Authorization");
    if (
      !SUPABASE_SERVICE_ROLE_KEY ||
      !authHeader ||
      !authHeader.startsWith("Bearer ") ||
      !isServiceRoleToken(authHeader)
    ) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Check if the request has a valid content type
    const contentType = req.headers.get("Content-Type");
    if (!contentType || contentType !== "application/json") {
      return new Response("Unsupported Media Type", { status: 415 });
    }

    const { type, table, record, old_record } = await req.json();

    console.log("Database event:", { type, table, record, old_record });

    // this edge function is triggered via database webhooks on the jobs table
    if (type === "INSERT" && table === "jobs") {
      console.log("Job inserted uid:", record.uid);
      return upsertCalendarEvent(record);
    }
    if (type === "UPDATE" && table === "jobs") {
      // Handle job update
      console.log("Job updated uid:", record.uid);
      console.log("Job calendar_event_id:", record.calendar_event_id);
      return upsertCalendarEvent(record);
    }
    if (type === "DELETE" && table === "jobs") {
      console.log("Job deleted uid:", old_record.uid);
      // old_record contains the previous state of the record. A job that was
      // never synced (no start date, creator had no calendar, ...) has nothing
      // to remove; that is not an error, and returning one only fills the
      // webhook log.
      if (!old_record.calendar_event_id) {
        return json({ skipped: "no calendar event to delete" }, 200);
      }
      const target = await resolveTarget(old_record.created_by ?? null);
      if (!target) {
        return json({ skipped: "no calendar connected for this job" }, 200);
      }
      try {
        await deleteCalendarEvent(target, old_record.calendar_event_id);
        console.log("Calendar event deleted successfully");
      } catch (error) {
        console.error("Error deleting calendar event:", error);
        await markRevokedIfGrantRejected(target, error);
        return new Response(
          "Error deleting calendar event: " + (error as any).message,
          { status: 500 },
        );
      }
    }

    return json({ success: true }, 200);
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response("Internal Server Error: " + (error as any).message, {
      status: 500,
    });
  }
});

// Find the calendar a job should be pushed to: the creator's connected
// calendar, else the shared fallback if one is still configured, else none.
const resolveTarget = async (
  ownerId: string | null,
): Promise<CalendarTarget | null> => {
  if (ownerId) {
    const { data, error } = await supabase
      .from("email_integrations")
      .select("grant_id, calendar_id, status")
      .eq("user_id", ownerId)
      .maybeSingle();

    if (error) {
      console.error("Error reading email_integrations:", error);
    } else if (data?.status === "active" && data.grant_id) {
      return {
        grantId: data.grant_id,
        // "primary" is understood by Google and Microsoft alike; only used
        // when calendar-connect could not list calendars at connect time.
        calendarId: data.calendar_id || "primary",
        userId: ownerId,
      };
    } else if (data) {
      console.log(`Connection for user ${ownerId} is ${data.status}; using fallback`);
    }
  }

  if (FALLBACK_GRANT_ID) {
    return {
      grantId: FALLBACK_GRANT_ID,
      calendarId: FALLBACK_CALENDAR_ID || "primary",
      userId: null,
    };
  }

  return null;
};

const nylasStatus = (error: unknown): number | undefined =>
  (error as any)?.statusCode ?? (error as any)?.status;

// Nylas answers 401/403 when the grant behind a request is no longer valid
// (the user removed HandyTally from their Google account, or the grant
// expired). Record that so the Schedule page can offer "Reconnect" instead of
// silently failing on every job from then on.
const markRevokedIfGrantRejected = async (
  target: CalendarTarget,
  error: unknown,
) => {
  const status = nylasStatus(error);
  if (!target.userId || (status !== 401 && status !== 403)) return;

  const { error: updateError } = await supabase
    .from("email_integrations")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("user_id", target.userId);

  if (updateError) {
    console.error("Failed to mark connection revoked:", updateError);
  } else {
    console.warn(`Marked calendar connection for user ${target.userId} as revoked`);
  }
};

const upsertCalendarEvent = async (record: any) => {
  // Handle job upsert
  console.log("Job uid:", record.uid);
  console.log("Job client uid:", record.client_id);
  console.log("created_by", record.created_by);
  console.log("start_date", record.start_date);
  console.log("end_date", record.end_date);

  const target = await resolveTarget(record.created_by ?? null);
  if (!target) {
    console.log("No calendar connected for this job's creator and no fallback; skipping");
    return json({ skipped: "no calendar connected for this job" }, 200);
  }

  // fetch client for client.email and client.address using supabase client
  const { data: client, error } = await supabase.from("clients").select().eq(
    "uid",
    record.client_id,
  ).single();

  if (error) {
    console.error("Error fetching client data: ", error);
    return new Response("Error fetching client data: " + error.message, {
      status: 400,
    });
  }

  console.log("Client info:", client);

  // return 401 on missing client email
  if (!client.email) {
    return new Response("client.email missing to send calendar event", {
      status: 400,
    });
  }
  // return 401 on missing start_date
  if (!record.start_date) {
    return new Response("start_date missing to send calendar event", {
      status: 400,
    });
  }

  try {
    console.log(`Upserting event on grant ${target.grantId} calendar ${target.calendarId}`);

    // write event description
    let eventDescription = "";
    eventDescription += `Job Title: ${record.title || "Pending"}\n\n`;
    eventDescription += `-----------------------\n\n`;
    eventDescription += `Client Name: ${client.name || "Pending"}\n`;
    eventDescription += `Client Email: ${client.email}\n`;
    eventDescription += `Client Address: ${client.address || "Pending"}\n\n`;
    eventDescription += `-----------------------\n\n`;
    eventDescription += `Job Description: ${
      record.description || "Pending"
    }\n\n`;
    eventDescription += `-----------------------\n\n`;
    eventDescription += `Job Start Date: ${record.start_date}\n`;
    eventDescription += `Job End Date: ${record.end_date || "Pending"}\n`;
    eventDescription += `Job Status: ${
      record.status ? String(record.status).toUpperCase() : "Pending"
    }\n`;

    const startTime = Math.floor(new Date(record.start_date).getTime() / 1000);

    // if missing end_date, set it to 1 hour after start_date and update on
    // next update. (This used to add 3600 ms, not seconds, so every open-ended
    // job was a 3.6 second event.)
    let endTime = record.end_date
      ? Math.floor(new Date(record.end_date).getTime() / 1000)
      : startTime + 3600;

    // check if endTime is before startTime, this will throw an error in Nylas API so we need to handle it
    if (endTime < startTime) {
      console.warn(
        "End date behind start date, setting to 1 hour after start date",
      );
      endTime = startTime + 3600;
    }

    const requestBody = {
      title: record.title || "Job Title [PENDING]",
      when: {
        startTime,
        endTime,
      },
      description: eventDescription,
      location: client.address || "",
      participants: [
        {
          email: client.email as string,
          status: "noreply" as const,
        },
      ],
      notifyParticipants: true,
    };
    const queryParams = { calendarId: target.calendarId };

    let event;
    let existingEventId: string | null = record.calendar_event_id || null;

    if (existingEventId) {
      try {
        event = await nylas.events.update({
          identifier: target.grantId,
          eventId: existingEventId,
          requestBody,
          queryParams,
        });
      } catch (updateError) {
        // The stored event is not on this calendar: the creator connected a
        // different account since it was made, or deleted the event by hand.
        // Recreate rather than leave the job unsynced forever.
        if (nylasStatus(updateError) === 404) {
          console.warn(
            `Event ${existingEventId} not found on grant ${target.grantId}; creating a new one`,
          );
          existingEventId = null;
        } else {
          throw updateError;
        }
      }
    }

    if (!existingEventId) {
      event = await nylas.events.create({
        identifier: target.grantId,
        requestBody,
        queryParams,
      });
    }

    console.log("Event:", event);
    console.log("Event ID:", event.data.id);

    if (event.data.id !== record.calendar_event_id) {
      // update job in supabase with nylas event id
      const { error: updateError } = await supabase
        .from("jobs")
        .update({ calendar_event_id: event.data.id })
        .eq("uid", record.uid);
      if (updateError) {
        console.error(
          "Error updating job with calendar event ID:",
          updateError,
        );
        return new Response(
          "Error updating job with calendar event ID: " + updateError.message,
          { status: 500 },
        );
      }
    }

    return json(event.data, 200);
  } catch (error) {
    console.error("Error sending calendar invite:", error);
    await markRevokedIfGrantRejected(target, error);
    return json(
      {
        success: false,
        error: "Failed to send calendar invite" + (error as any).message,
      },
      500,
    );
  }
};

const deleteCalendarEvent = async (target: CalendarTarget, eventId: string) => {
  try {
    return await nylas.events.destroy({
      identifier: target.grantId,
      eventId: eventId,
      queryParams: {
        calendarId: target.calendarId,
      },
      notifyParticipants: true,
    });
  } catch (error) {
    // Already gone (removed by hand, or the account was reconnected and the
    // event lives on the old grant). The job is being deleted either way.
    if (nylasStatus(error) === 404) {
      console.warn(`Event ${eventId} already absent from grant ${target.grantId}`);
      return null;
    }
    console.error("Error deleting calendar event:", error);
    throw error;
  }
};
