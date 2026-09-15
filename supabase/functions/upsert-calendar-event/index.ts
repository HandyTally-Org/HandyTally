// upsert-calendar-event: emails a calendar invite for a job to the client and
// to the user who created the job. HT-1.
//
// Called two ways:
//   * by the database webhook on public.jobs (INSERT / UPDATE / DELETE), with
//     the service-role key as bearer -- see README.md for the configuration;
//   * by a signed-in user from the Jobs screens ("Send calendar invite"),
//     with their session token and a body of { action: "send", jobId }.
//
// How it works
// ------------
// The job is turned into a small iCalendar (RFC 5545) file and sent through
// Resend, the same provider send-invoice uses, as a `text/calendar` attachment.
// Gmail, Outlook and Apple Mail all recognise that as an invitation: the
// message shows Yes / No / Maybe and the event lands on the recipient's own
// calendar. No calendar API, no OAuth, no per-user credentials.
//
//   INSERT / UPDATE  -> METHOD:REQUEST  (create, or update the same UID)
//   DELETE           -> METHOD:CANCEL   (same UID, STATUS:CANCELLED)
//
// The UID is derived from the job (`job-<uid>@handytally`) so an update or a
// cancellation always targets the event the recipient already has. SEQUENCE
// must increase on every resend for clients to accept the change; the current
// time in seconds is used so no counter has to be stored.
//
// jobs.calendar_event_id records the UID once an invite has gone out. DELETE
// only sends a cancellation if that column holds one of our UIDs, so jobs
// whose events were created by the earlier Nylas integration (a Nylas event
// id in that column) do not produce a cancellation for an invite nobody
// received.
//
// Secrets (shared with send-invoice)
// ----------------------------------
//   RESEND_API_KEY
//   INVOICE_FROM_ADDRESS     "HandyTally <invoices@example.com>"; the organiser
//   CALENDAR_FROM_ADDRESS    optional override for the sender of invites
//   INVOICE_REPLY_TO         optional
//   SUPABASE_SERVICE_ROLE_KEY  injected; webhook auth, reads and the write-back

// URL imports only: the self-hosted edge runtime starts workers without an
// import map (see main/index.ts on the host), so a bare "supabase-js"
// specifier from deno.json does not resolve there. Same as send-invoice.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { timingSafeEqual } from "https://deno.land/std@0.168.0/crypto/timing_safe_equal.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") as string;
const FROM_ADDRESS = Deno.env.get("CALENDAR_FROM_ADDRESS") ||
  (Deno.env.get("INVOICE_FROM_ADDRESS") as string);
const REPLY_TO = Deno.env.get("INVOICE_REPLY_TO");

// This function is called by a database webhook on the jobs table, not by a
// user, so there is no session to check. The webhook is configured (Database ->
// Webhooks on the self-hosted dashboard) to send
//   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
// and only that exact token is accepted. The gateway's JWT check alone is not
// enough: the anon key passes it too, and the anon key is public.
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
// Used only to resolve a user's session token when the app calls us directly.
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") as string;

// Service-role client: reads clients and auth.users, writes
// jobs.calendar_event_id, without depending on row-level-security policies.
const SUPABASE_URL_FOR_AUTH = Deno.env.get("SUPABASE_URL") as string;
const supabase = createClient(
  SUPABASE_URL_FOR_AUTH,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const encoder = new TextEncoder();

// Constant-time comparison so response timing does not leak how much of the
// token matched.
const isServiceRoleToken = (authHeader: string): boolean =>
  timingSafeEqual(
    encoder.encode(authHeader.slice("Bearer ".length)),
    encoder.encode(SUPABASE_SERVICE_ROLE_KEY),
  );

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const authHeader = req.headers.get("Authorization");
    if (!SUPABASE_SERVICE_ROLE_KEY || !authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const contentType = req.headers.get("Content-Type");
    if (!contentType || !contentType.startsWith("application/json")) {
      return new Response("Unsupported Media Type", { status: 415 });
    }

    if (!RESEND_API_KEY || !FROM_ADDRESS) {
      console.error("Missing RESEND_API_KEY or INVOICE_FROM_ADDRESS / CALENDAR_FROM_ADDRESS");
      return json({ error: "Calendar invites are not configured on the server" }, 500);
    }

    const body = await req.json();

    // Not the webhook: treat the bearer as a user session. The gateway's JWT
    // check alone would let the public anon key through, so resolve the token
    // to a user (same reasoning as send-invoice).
    if (!isServiceRoleToken(authHeader)) {
      const { data: { user }, error: authError } = await createClient(
        SUPABASE_URL_FOR_AUTH,
        SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: authHeader } } },
      ).auth.getUser();
      if (authError || !user) {
        return new Response("Unauthorized", { status: 401 });
      }
      return await sendOnRequest(body, user.email ?? null);
    }

    const { type, table, record, old_record } = body;
    console.log("Database event:", { type, table, record, old_record });

    if (table !== "jobs") {
      return json({ skipped: `not a jobs event (${table})` });
    }

    if (type === "INSERT") {
      return await sendInvite(record);
    }
    if (type === "UPDATE") {
      // Sending an invite writes calendar_event_id back to the job, which
      // fires this webhook again. Nothing else sets that column, so a change
      // to it means "our own write-back": skip, or every new job would get a
      // second "Updated:" email seconds after the first.
      if (record.calendar_event_id !== old_record?.calendar_event_id) {
        return json({ skipped: "calendar_event_id write-back" });
      }
      if (!inviteRelevantChange(record, old_record)) {
        return json({ skipped: "no change to the invited details" });
      }
      return await sendInvite(record);
    }
    if (type === "DELETE") {
      return await sendCancellation(old_record);
    }

    return json({ skipped: `unhandled event type ${type}` });
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response("Internal Server Error: " + (error as any).message, {
      status: 500,
    });
  }
});

// Only resend when something the recipient's calendar shows has changed.
// A status change alone (pending -> completed) is not worth an "Updated:"
// email; the manual "Send calendar invite" button covers the odd case.
const INVITE_FIELDS = ["title", "description", "start_date", "end_date", "client_id"] as const;

const inviteRelevantChange = (record: any, oldRecord: any) =>
  !oldRecord || INVITE_FIELDS.some((f) => (record?.[f] ?? null) !== (oldRecord?.[f] ?? null));

// ---------------------------------------------------------------------------
// Job -> recipients
// ---------------------------------------------------------------------------

type Client = { name?: string | null; email?: string | null; address?: string | null };

const fetchClient = async (clientId: number | null): Promise<Client | null> => {
  if (!clientId) return null;
  const { data, error } = await supabase
    .from("clients")
    .select("name, email, address")
    .eq("uid", clientId)
    .maybeSingle();
  if (error) {
    console.error("Error fetching client:", error);
    return null;
  }
  return data;
};

// HT-1: the user who created the job (jobs.created_by) is invited too, so the
// job shows on their own calendar. Their email comes from auth.users.
const fetchCreatorEmail = async (createdBy: string | null): Promise<string | null> => {
  if (!createdBy) return null;
  const { data, error } = await supabase.auth.admin.getUserById(createdBy);
  if (error || !data?.user?.email) {
    console.warn(`Could not resolve email for job creator ${createdBy}:`, error?.message);
    return null;
  }
  return data.user.email;
};

type Attendee = { email: string; name?: string | null };

const collectAttendees = (
  client: Client | null,
  creatorEmail: string | null,
  requesterEmail: string | null = null,
): Attendee[] => {
  const seen = new Set<string>();
  const out: Attendee[] = [];
  const add = (email?: string | null, name?: string | null) => {
    const trimmed = email?.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ email: trimmed, name });
  };
  add(client?.email, client?.name);
  add(creatorEmail);
  // The person who pressed "Send calendar invite" gets it too, which matters
  // for jobs created before created_by existed.
  add(requesterEmail);
  return out;
};

// ---------------------------------------------------------------------------
// iCalendar
// ---------------------------------------------------------------------------

const jobUid = (jobId: number | string) => `job-${jobId}@handytally`;

const isOurUid = (value: unknown) =>
  typeof value === "string" && /^job-\d+@handytally$/.test(value);

const pad = (n: number) => String(n).padStart(2, "0");

// 20260915T140000Z
const icsDate = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
  `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

// RFC 5545 3.3.11: backslash, semicolon and comma are escaped; newlines
// become a literal "\n".
const icsText = (value: unknown) =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

// RFC 5545 3.1: lines longer than 75 octets are folded; continuation lines
// start with a single space. Folding by character keeps ASCII lines within
// the limit; a line of non-ASCII text may run a few octets over, which every
// mainstream client tolerates.
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
};

// Parameter values (CN=...) are not backslash-escaped like text values; they
// are quoted, and may not contain a double quote. RFC 5545 3.2.
const icsParam = (value: unknown) => `"${String(value ?? "").replace(/["\r\n]/g, "")}"`;

// "HandyTally <invoices@example.com>" -> { name: "HandyTally", email: "invoices@example.com" }
const parseAddress = (value: string) => {
  const m = value.match(/^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/);
  return m
    ? { name: m[1]?.trim() || "HandyTally", email: m[2].trim() }
    : { name: "HandyTally", email: value.trim() };
};

type EventTimes = { start: Date; end: Date };

// No end date: one hour. End before start: one hour after start.
const eventTimes = (record: any): EventTimes | null => {
  if (!record.start_date) return null;
  const start = new Date(record.start_date);
  if (Number.isNaN(start.getTime())) return null;
  let end = record.end_date ? new Date(record.end_date) : new Date(start.getTime() + 3600_000);
  if (Number.isNaN(end.getTime()) || end.getTime() < start.getTime()) {
    end = new Date(start.getTime() + 3600_000);
  }
  return { start, end };
};

const describeJob = (record: any, client: Client | null) =>
  [
    `Job Title: ${record.title || "Pending"}`,
    "",
    "-----------------------",
    "",
    `Client Name: ${client?.name || "Pending"}`,
    `Client Email: ${client?.email || "Pending"}`,
    `Client Address: ${client?.address || "Pending"}`,
    "",
    "-----------------------",
    "",
    `Job Description: ${record.description || "Pending"}`,
    "",
    "-----------------------",
    "",
    `Job Start Date: ${record.start_date}`,
    `Job End Date: ${record.end_date || "Pending"}`,
    `Job Status: ${record.status ? String(record.status).toUpperCase() : "Pending"}`,
  ].join("\n");

const buildIcs = (opts: {
  method: "REQUEST" | "CANCEL";
  uid: string;
  times: EventTimes;
  summary: string;
  description: string;
  location: string;
  attendees: Attendee[];
}) => {
  const organiser = parseAddress(FROM_ADDRESS);
  const now = new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HandyTally//Jobs//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${opts.method}`,
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    // Must increase on every resend or clients ignore the update.
    `SEQUENCE:${Math.floor(now.getTime() / 1000)}`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(opts.times.start)}`,
    `DTEND:${icsDate(opts.times.end)}`,
    `SUMMARY:${icsText(opts.summary)}`,
    `DESCRIPTION:${icsText(opts.description)}`,
    ...(opts.location ? [`LOCATION:${icsText(opts.location)}`] : []),
    `ORGANIZER;CN=${icsParam(organiser.name)}:mailto:${organiser.email}`,
    ...opts.attendees.map((a) =>
      `ATTENDEE;CN=${icsParam(a.name || a.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`
    ),
    `STATUS:${opts.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
};

// ---------------------------------------------------------------------------
// Resend
// ---------------------------------------------------------------------------

const toBase64 = (text: string) => {
  const bytes = encoder.encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const sendEmail = async (opts: {
  to: string[];
  subject: string;
  html: string;
  ics: string;
  method: "REQUEST" | "CANCEL";
}) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
      attachments: [
        {
          filename: "invite.ics",
          content: toBase64(opts.ics),
          // The method parameter is what makes mail clients treat the
          // attachment as an invitation rather than a plain file.
          content_type: `text/calendar; method=${opts.method}; charset=UTF-8`,
        },
      ],
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Resend rejected the send:", result);
    throw new Error(result?.message ?? `Resend responded ${response.status}`);
  }
  return result?.id ?? null;
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const formatWhen = (times: EventTimes) =>
  times.start.toUTCString().replace(" GMT", " UTC");

// "Send calendar invite" pressed in the app: load the job and send as if the
// webhook had fired, plus the requesting user as an attendee. Any signed-in
// user may do this for any job, which matches what row-level security lets
// them read today (HT-14); tighten alongside the organization scoping.
const sendOnRequest = async (body: any, requesterEmail: string | null) => {
  if (body?.action !== "send" || !body.jobId) {
    return json({ error: "Expected { action: \"send\", jobId }" }, 400);
  }
  const { data: job, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("uid", body.jobId)
    .maybeSingle();
  if (error) {
    console.error("Error loading job:", error);
    return json({ error: "Could not load the job" }, 500);
  }
  if (!job) {
    return json({ error: "Job not found" }, 404);
  }
  return await sendInvite(job, requesterEmail);
};

const sendInvite = async (record: any, requesterEmail: string | null = null) => {
  const times = eventTimes(record);
  if (!times) {
    // A job without a date is a normal state, not an error.
    return json({ skipped: "job has no start date" });
  }

  const [client, creatorEmail] = await Promise.all([
    fetchClient(record.client_id ?? null),
    fetchCreatorEmail(record.created_by ?? null),
  ]);
  const attendees = collectAttendees(client, creatorEmail, requesterEmail);
  if (attendees.length === 0) {
    return json({ skipped: "neither the client nor the job creator has an email" });
  }

  const uid = jobUid(record.uid);
  const title = record.title || "Job [PENDING]";
  const description = describeJob(record, client);
  const ics = buildIcs({
    method: "REQUEST",
    uid,
    times,
    summary: title,
    description,
    location: client?.address || "",
    attendees,
  });

  const isUpdate = isOurUid(record.calendar_event_id);
  const subject = `${isUpdate ? "Updated: " : ""}${title} — ${formatWhen(times)}`;
  const html = `<p>${isUpdate ? "This job has been updated." : "You have been scheduled for a job."}</p>` +
    `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(description)}</pre>` +
    `<p>Open the attached invitation to add it to your calendar.</p>`;

  try {
    const id = await sendEmail({
      to: attendees.map((a) => a.email),
      subject,
      html,
      ics,
      method: "REQUEST",
    });
    console.log(`Invite ${uid} sent to ${attendees.map((a) => a.email).join(", ")} (resend id ${id})`);
  } catch (error) {
    return json({ success: false, error: `Failed to send calendar invite: ${(error as any).message}` }, 500);
  }

  if (record.calendar_event_id !== uid) {
    const { error } = await supabase
      .from("jobs")
      .update({ calendar_event_id: uid })
      .eq("uid", record.uid);
    if (error) {
      console.error("Error recording calendar_event_id on job:", error);
      return json({ success: false, error: "Invite sent but could not record it on the job: " + error.message }, 500);
    }
  }

  return json({ success: true, uid, to: attendees.map((a) => a.email) });
};

const sendCancellation = async (oldRecord: any) => {
  if (!isOurUid(oldRecord.calendar_event_id)) {
    // Never invited under this scheme (no date, no recipients, or an event
    // created by the earlier Nylas integration): nothing to cancel.
    return json({ skipped: "no invite was sent for this job" });
  }

  const times = eventTimes(oldRecord) ??
    { start: new Date(), end: new Date(Date.now() + 3600_000) };

  const [client, creatorEmail] = await Promise.all([
    fetchClient(oldRecord.client_id ?? null),
    fetchCreatorEmail(oldRecord.created_by ?? null),
  ]);
  const attendees = collectAttendees(client, creatorEmail);
  if (attendees.length === 0) {
    return json({ skipped: "no recipients left to notify" });
  }

  const uid = oldRecord.calendar_event_id as string;
  const title = oldRecord.title || "Job [PENDING]";
  const ics = buildIcs({
    method: "CANCEL",
    uid,
    times,
    summary: title,
    description: describeJob(oldRecord, client),
    location: client?.address || "",
    attendees,
  });

  try {
    const id = await sendEmail({
      to: attendees.map((a) => a.email),
      subject: `Cancelled: ${title} — ${formatWhen(times)}`,
      html: `<p>This job has been cancelled and removed from the schedule.</p>` +
        `<p>Open the attached file, or accept the cancellation in your mail client, to remove it from your calendar.</p>`,
      ics,
      method: "CANCEL",
    });
    console.log(`Cancellation ${uid} sent to ${attendees.map((a) => a.email).join(", ")} (resend id ${id})`);
  } catch (error) {
    return json({ success: false, error: `Failed to send cancellation: ${(error as any).message}` }, 500);
  }

  return json({ success: true, uid, cancelled: true });
};
