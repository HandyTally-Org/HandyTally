// approve-estimate: turns an estimate into a work order when the client
// clicks Approve in the email sent by send-estimate-approval. HT-10.
//
// The public page web/app/approve.tsx reads the token from its URL and posts
//
//   { token }
//
// here with the anon key. No user session is involved: anyone holding the
// link can approve, which is the intended behaviour. The token is the only
// check, so it is looked up with the service role rather than through RLS.
//
// Result is always a 200 with { result }:
//   approved          status was estimate; now work_order, approved_at set
//   already_approved  approved earlier; nothing changed
//   closed            the document is no longer an estimate and was never
//                     approved through this link (cancelled, moved on by hand)
//   invalid           no estimate has this token
//
// On approval the user who created the estimate is emailed a short note.
//
// Secrets: RESEND_API_KEY, INVOICE_FROM_ADDRESS, INVOICE_REPLY_TO (optional),
// APP_URL (optional; the link back to the app in the notification).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const INVOICE_FROM_ADDRESS = Deno.env.get("INVOICE_FROM_ADDRESS");
const INVOICE_REPLY_TO = Deno.env.get("INVOICE_REPLY_TO");
const APP_URL = Deno.env.get("APP_URL");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatMoney = (value: unknown) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
    .format(Number(value) || 0);

const INVOICE_COLUMNS =
  "uid, invoice_number, status, total, approved_at, created_by, organization_id, clients:client_id (name)";

// HT-88: the service role sees every organisation's company row, so read the
// estimate's own (newest first, in case an organisation has two).
const businessNameFor = async (
  admin: ReturnType<typeof createClient>,
  invoice: { organization_id: string | null },
): Promise<string> => {
  let query = admin.from("company").select("business_name");
  if (invoice.organization_id) query = query.eq("organization_id", invoice.organization_id);
  const { data: company } = await query
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return (company as { business_name?: string | null } | null)?.business_name || "HandyTally";
};

type InvoiceRow = {
  uid: string | number;
  organization_id: string | null;
  invoice_number: string | number;
  status: string;
  total: number | null;
  approved_at: string | null;
  created_by: string | null;
  clients: { name?: string | null } | null;
};

const summary = (invoice: InvoiceRow, businessName: string) => ({
  invoice_number: invoice.invoice_number,
  total: invoice.total,
  client_name: invoice.clients?.name ?? null,
  approved_at: invoice.approved_at,
  business_name: businessName,
});

// Best effort: the approval itself has already been recorded. A failure
// here is logged, never surfaced to the client.
async function notifyCreator(
  admin: ReturnType<typeof createClient>,
  invoice: InvoiceRow,
  businessName: string,
  appOrigin: string,
) {
  if (!invoice.created_by) return;
  if (!RESEND_API_KEY || !INVOICE_FROM_ADDRESS) {
    console.warn("Approval notification skipped: RESEND_API_KEY or INVOICE_FROM_ADDRESS not set");
    return;
  }

  const { data, error } = await admin.auth.admin.getUserById(invoice.created_by);
  const to = data?.user?.email;
  if (error || !to) {
    console.warn(`Approval notification skipped: no email for creator ${invoice.created_by}`, error?.message);
    return;
  }

  const clientName = invoice.clients?.name || "The client";
  const link = appOrigin ? `${appOrigin}/invoices` : null;
  const html = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 24px 16px;">
      <h1 style="font-size: 20px; margin: 0 0 16px 0;">Estimate #${escapeHtml(invoice.invoice_number)} approved</h1>
      <p style="font-size: 15px; line-height: 1.5;">
        ${escapeHtml(clientName)} approved estimate #${escapeHtml(invoice.invoice_number)}
        for ${escapeHtml(formatMoney(invoice.total))}. It is now a work order.
      </p>
      ${link ? `<p style="font-size: 15px;"><a href="${escapeHtml(link)}">Open it in ${escapeHtml(businessName)}'s HandyTally</a></p>` : ""}
    </div>
  `;

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
        subject: `Estimate #${invoice.invoice_number} approved by ${clientName}`,
        html,
        ...(INVOICE_REPLY_TO ? { reply_to: INVOICE_REPLY_TO } : {}),
      }),
    });
    if (!response.ok) {
      console.error("Resend rejected the approval notification:", await response.text());
    }
  } catch (error) {
    console.error("Error sending the approval notification:", error);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
    return json({ error: "Approval is not configured on the server" }, 500);
  }

  let token: unknown;
  try {
    ({ token } = await req.json() ?? {});
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (typeof token !== "string" || !UUID_PATTERN.test(token)) {
    return json({ result: "invalid" }, 200);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // One conditional update does the work: it only matches while the row is
  // still an estimate, so two clicks on the same link cannot both approve.
  const approvedAt = new Date().toISOString();
  const { data: approved, error: updateError } = await admin
    .from("invoices")
    .update({ status: "work_order", approved_at: approvedAt })
    .eq("approval_token", token)
    .eq("status", "estimate")
    .select(INVOICE_COLUMNS)
    .maybeSingle();

  if (updateError) {
    console.error("Could not approve the estimate:", updateError);
    return json({ error: "Could not approve the estimate" }, 500);
  }

  if (approved) {
    const invoice = approved as unknown as InvoiceRow;
    const businessName = await businessNameFor(admin, invoice);
    console.log(`Estimate #${invoice.invoice_number} approved`);
    const appOrigin = (APP_URL || req.headers.get("Origin") || "").replace(/\/+$/, "");
    await notifyCreator(admin, invoice, businessName, appOrigin);
    return json({ result: "approved", ...summary(invoice, businessName) }, 200);
  }

  // Nothing changed: work out why so the page can say something useful.
  const { data: existing, error: readError } = await admin
    .from("invoices")
    .select(INVOICE_COLUMNS)
    .eq("approval_token", token)
    .maybeSingle();

  if (readError) {
    console.error("Could not read the estimate:", readError);
    return json({ error: "Could not read the estimate" }, 500);
  }
  if (!existing) {
    return json({ result: "invalid" }, 200);
  }

  const invoice = existing as unknown as InvoiceRow;
  const businessName = await businessNameFor(admin, invoice);
  if (invoice.approved_at) {
    return json({ result: "already_approved", ...summary(invoice, businessName) }, 200);
  }
  return json({ result: "closed", ...summary(invoice, businessName) }, 200);
});
