import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Resend is used for outbound mail. Set these in the project's function secrets:
//   RESEND_API_KEY        - API key from the Resend dashboard
//   INVOICE_FROM_ADDRESS  - verified sender, e.g. "HandyTally <invoices@handytally.com>"
//   INVOICE_REPLY_TO      - optional, where client replies should land
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") as string;
const INVOICE_FROM_ADDRESS = Deno.env.get("INVOICE_FROM_ADDRESS") as string;
const INVOICE_REPLY_TO = Deno.env.get("INVOICE_REPLY_TO");

// Injected by the platform; used only to verify the caller's session token.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") as string;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// The caller renders the invoice HTML with web/utils/invoiceHtml.ts and posts it
// here, so the emailed document is byte-for-byte what the sender saw on screen.
type SendInvoiceRequest = {
  to: string;
  subject: string;
  html: string;
  // HT-87: the invoice being sent. Its organisation's Company > Documents
  // rows marked "On invoices" that carry a file ride along as attachments.
  invoiceId?: string | number;
  // Extra [{ filename, content }] (base64) from the caller, e.g. a PDF once
  // that exists. Company documents are added here, not by the browser.
  attachments?: { filename: string; content: string }[];
};

type MailAttachment = { filename: string; content: string };

// Resend caps a message at 40 MB and base64 inflates by a third, so keep the
// documents well under that and leave room for the HTML and the logo.
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

// HT-87: the organisation's documents marked "On invoices" that have a file.
// Read as the caller (RLS applies, so a user only ever gets rows they can see)
// and narrowed to the invoice's organisation, because a superuser or a member
// of several organisations sees more than one organisation's rows. Returns an
// error message instead of attachments when the files would not fit.
const loadDocumentAttachments = async (
  caller: ReturnType<typeof createClient>,
  organizationId: string | null,
): Promise<{ attachments: MailAttachment[]; error?: string }> => {
  let query = caller
    .from("company_attachments")
    .select("name, file_size, file_data")
    .eq("is_logo", false)
    .eq("include_on_invoices", true)
    .not("file_data", "is", null)
    .order("id", { ascending: true });
  query = organizationId ? query.eq("organization_id", organizationId) : query.is("organization_id", null);

  const { data, error } = await query;
  if (error) throw error;

  const attachments: MailAttachment[] = [];
  let totalBytes = 0;
  for (const row of (data ?? []) as { name: string | null; file_size: number | null; file_data: string | null }[]) {
    if (!row.file_data) continue;
    totalBytes += row.file_size ?? Math.floor((row.file_data.length * 3) / 4);
    attachments.push({ filename: row.name || "document", content: row.file_data });
  }

  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    const mb = (totalBytes / (1024 * 1024)).toFixed(1);
    return {
      attachments: [],
      error: `The company documents marked for invoices total ${mb} MB; the email limit is ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB. Untick some under Admin > Company > Documents and send again.`,
    };
  }
  return { attachments };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  // Only signed-in users may send. The client passes the caller's session token.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  // The gateway only checks that the bearer token is a JWT signed by this
  // project, and the anon key satisfies that -- it ships in the app bundle and
  // is public. Resolve the token to a user so that anything short of a live
  // session (the bare anon key, an expired or revoked session) is refused.
  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await caller.auth.getUser();

  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!RESEND_API_KEY || !INVOICE_FROM_ADDRESS) {
    console.error("Missing RESEND_API_KEY or INVOICE_FROM_ADDRESS");
    return json({ error: "Email is not configured on the server" }, 500);
  }

  let payload: SendInvoiceRequest;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { to, subject, html, invoiceId } = payload ?? {};
  if (!to || !subject || !html) {
    return json({ error: "to, subject and html are all required" }, 400);
  }

  const attachments: MailAttachment[] = [...(payload.attachments ?? [])];

  if (invoiceId) {
    // The invoice is read as the caller too: if RLS hides it, the caller has
    // no business attaching that organisation's documents.
    const { data: invoice, error: invoiceError } = await caller
      .from("invoices")
      .select("organization_id")
      .eq("uid", invoiceId)
      .maybeSingle();
    if (invoiceError) {
      console.error("Could not load the invoice:", invoiceError);
      return json({ error: "Could not load the invoice" }, 500);
    }
    if (!invoice) {
      return json({ error: "Invoice not found" }, 404);
    }

    try {
      const documents = await loadDocumentAttachments(caller, (invoice as { organization_id: string | null }).organization_id);
      if (documents.error) {
        return json({ error: documents.error }, 400);
      }
      attachments.push(...documents.attachments);
    } catch (error) {
      console.error("Could not load the company documents:", error);
      return json({ error: "Could not load the company documents to attach" }, 500);
    }
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: INVOICE_FROM_ADDRESS,
        to: [to],
        subject,
        html,
        ...(INVOICE_REPLY_TO ? { reply_to: INVOICE_REPLY_TO } : {}),
        ...(attachments.length ? { attachments } : {}),
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      // Surface the provider's reason so the caller can show something useful.
      // Not 502: Cloudflare sits in front of the self-hosted instance and
      // replaces any origin 502/504 with its own bare error page, so the
      // message below would never reach the app. 400 passes through intact.
      console.error("Resend rejected the send:", result);
      return json(
        { error: result?.message ?? "The email provider rejected the request" },
        400,
      );
    }

    return json({ id: result?.id ?? null, attachmentCount: attachments.length }, 200);
  } catch (error) {
    console.error("Error sending invoice email:", error);
    return json({ error: "Failed to send the invoice email" }, 500);
  }
});
