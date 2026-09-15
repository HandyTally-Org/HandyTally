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
const NYLAS_GRANT_ID = Deno.env.get("NYLAS_GRANT_ID") as string;
const NYLAS_CALENDAR_ID = Deno.env.get("NYLAS_CALENDAR_ID") as string;

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
      // Handle job update
      console.log("Job deleted uid:", old_record.uid);
      // fetch and delete calendar event - old_record contains the previous state of the record
      if (!old_record.calendar_event_id) {
        return new Response("No calendar event ID to delete", { status: 400 });
      } else {
        try {
          await deleteCalendarEvent(old_record.calendar_event_id);
          console.log("Calendar event deleted successfully");
        } catch (error) {
          console.error("Error deleting calendar event:", error);
          return new Response(
            "Error deleting calendar event: " + (error as any).message,
            { status: 500 },
          );
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response("Internal Server Error: " + (error as any).message, {
      status: 500,
    });
  }
});

const upsertCalendarEvent = async (record: any) => {
  // Handle job upsert
  console.log("Job uid:", record.uid);
  console.log("Job client uid:", record.client_id);
  console.log("client_id", record.client_id);
  console.log("start_date", record.start_date);
  console.log("end_date", record.end_date);

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

  // send update using /functions/send-calendar-invite
  try {
    console.log("Creating event with Nylas API...");

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
    eventDescription += `Job Status: ${record.status.toString().toUpperCase() || "Pending"}\n`;

    let event;
    const calendarEventId = record.calendar_event_id;
    const startTime = Math.floor(new Date(record.start_date).getTime() / 1000);

    // if missing end_date, set it to 1 hour after start_date and update on next update
    let endTime = record.end_date
      ? Math.floor(new Date(record.end_date).getTime() / 1000)
      : Math.floor((new Date(record.start_date).getTime() + 3600) / 1000);

    // check if endTime is before startTime, this will throw an error in Nylas API so we need to handle it
    if (endTime < startTime) {
      console.warn(
        "End date behind start date, setting to 1 hour after start date",
      );
      endTime = Math.floor(new Date(record.start_date).getTime() / 1000) +
        3600;
    }

    if (!calendarEventId) {
      event = await nylas.events.create({
        identifier: NYLAS_GRANT_ID as string,
        requestBody: {
          title: record.title || "Job Title [PENDING]",
          when: {
            startTime,
            endTime,
          },
          description: eventDescription,
          location: client.address || "",
          participants: [
            {
              email: client.email,
              status: "noreply",
            },
          ],
          notifyParticipants: true,
        },
        queryParams: {
          calendarId: NYLAS_CALENDAR_ID as string,
        },
      });
    } else {
      event = await nylas.events.update({
        identifier: NYLAS_GRANT_ID as string,
        eventId: record.calendar_event_id as string,
        requestBody: {
          title: record.title || "Job Title [PENDING]",
          when: {
            startTime,
            endTime,
          },
          description: eventDescription,
          location: client.address || "",
          participants: [
            {
              email: client.email,
              status: "noreply",
            },
          ],
          notifyParticipants: true,
        },
        queryParams: {
          calendarId: NYLAS_CALENDAR_ID as string,
        },
      });
    }

    console.log("Event:", event);
    console.log("Event ID:", event.data.id);

    if (!record.calendar_event_id) {
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

    return new Response(JSON.stringify(event.data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error sending calendar invite:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to send calendar invite" + (error as any).message,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
};

const deleteCalendarEvent = async (eventId: string) => {
  try {
    return await nylas.events.destroy({
      identifier: NYLAS_GRANT_ID,
      eventId: eventId,
      queryParams: {
        calendarId: NYLAS_CALENDAR_ID,
      },
      notifyParticipants: true,
    });
  } catch (error) {
    console.error("Error deleting calendar event:", error);
    throw error;
  }
};
