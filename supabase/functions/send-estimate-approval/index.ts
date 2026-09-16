// send-estimate-approval: emails an estimate to the client and to the user
// who created it, with an Approve button that turns it into a work order.
// HT-10.
//
// Called from the "Send for Approval" dialog in web/components/InvoiceDetails.tsx
// with the user's session token and
//
//   { invoiceId, subject, message, document: { css, markup } }
//
// The app renders the estimate itself (web/utils/invoiceHtml.ts, the same
// markup Print uses) and posts the fragment; this function wraps it in the
// email: the subject as heading, the message, the document, the total and a
// dark blue Approve button. The button links to
//
//   <app origin>/approve?token=<invoices.approval_token>
//
// which the approve-estimate function honours. The token is read here with
// the service role and never sent to the browser. The origin is APP_URL when
// set, otherwise the request's Origin header (same rule as invite-user).
//
// Recipients: the client's email and the creator's email
// (invoices.created_by -> auth.users). When the estimate has no creator on
// record, the user sending it stands in.
//
// Secrets: RESEND_API_KEY, INVOICE_FROM_ADDRESS (shared with send-invoice),
// INVOICE_REPLY_TO (optional), APP_URL (optional).
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are injected.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") as string;
const INVOICE_FROM_ADDRESS = Deno.env.get("INVOICE_FROM_ADDRESS") as string;
const INVOICE_REPLY_TO = Deno.env.get("INVOICE_REPLY_TO");
const APP_URL = Deno.env.get("APP_URL");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// The button colour. Matches NAVY in web/components/invoiceDocStyles.ts.
const BUTTON_COLOR = "#1b365d";

type SendEstimateApprovalRequest = {
  invoiceId: string | number;
  subject: string;
  message?: string;
  document: { css: string; markup: string };
};

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

// Plain text typed in the dialog -> paragraphs with line breaks kept.
const messageToHtml = (message: string) =>
  escapeHtml(message)
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin: 0 0 12px 0;">${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");

const buildEmailHtml = (args: {
  subject: string;
  message: string;
  document: { css: string; markup: string };
  total: unknown;
  approveUrl: string;
  businessName: string;
}) => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; padding: 0; background: #f3f4f6; }
          .ht-mail { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f2937; max-width: 840px; margin: 0 auto; padding: 24px 16px; }
          .ht-mail h1 { font-size: 22px; margin: 0 0 16px 0; }
          .ht-mail .message { font-size: 15px; line-height: 1.5; margin-bottom: 20px; }
          .ht-mail .document { background: #ffffff; border: 1px solid #d5d8dc; border-radius: 4px; padding: 16px; }
          .ht-mail .total { font-size: 18px; font-weight: bold; text-align: right; margin: 20px 0 8px 0; }
          .ht-mail .approve { text-align: right; margin: 8px 0 24px 0; }
          .ht-mail .approve a { display: inline-block; background: ${BUTTON_COLOR}; color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 16px; padding: 12px 28px; border-radius: 4px; }
          .ht-mail .footer { font-size: 12px; color: #6b7280; line-height: 1.5; }
          ${args.document.css}
        </style>
      </head>
      <body>
        <div class="ht-mail">
          <h1>${escapeHtml(args.subject)}</h1>
          <div class="message">${messageToHtml(args.message)}</div>
          <div class="document">${args.document.markup}</div>
          <div class="total">Total: ${escapeHtml(formatMoney(args.total))}</div>
          <div class="approve">
            <a href="${escapeHtml(args.approveUrl)}">Approve estimate</a>
          </div>
          <div class="footer">
            Clicking Approve accepts this estimate from ${escapeHtml(args.businessName)} and turns it into a work order.
            Anyone with this email can approve it. If you have questions, reply to this email.
          </div>
        </div>
      </body>
    </html>
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  // Only signed-in users may send. The gateway's JWT check alone would let
  // the public anon key through, so resolve the token to a user.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const { data: { user: caller }, error: authError } = await createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ).auth.getUser(authHeader.slice("Bearer ".length));
  if (authError || !caller) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!RESEND_API_KEY || !INVOICE_FROM_ADDRESS) {
    console.error("Missing RESEND_API_KEY or INVOICE_FROM_ADDRESS");
    return json({ error: "Email is not configured on the server" }, 500);
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
    return json({ error: "The server cannot read the estimate" }, 500);
  }

  let payload: SendEstimateApprovalRequest;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { invoiceId, subject, message, document } = payload ?? {};
  if (!invoiceId || !subject?.trim() || !document?.markup) {
    return json({ error: "invoiceId, subject and document are all required" }, 400);
  }

  const appOrigin = (APP_URL || req.headers.get("Origin") || "").replace(/\/+$/, "");
  if (!appOrigin) {
    return json({ error: "Cannot build the approval link: set APP_URL on the function" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: invoice, error: invoiceError } = await admin
    .from("invoices")
    .select("uid, invoice_number, status, total, approval_token, created_by, clients:client_id (name, email)")
    .eq("uid", invoiceId)
    .maybeSingle();

  if (invoiceError) {
    console.error("Could not load the estimate:", invoiceError);
    return json({ error: "Could not load the estimate" }, 500);
  }
  if (!invoice) {
    return json({ error: "Estimate not found" }, 404);
  }
  if (invoice.status !== "estimate") {
    return json({ error: "Only an estimate can be sent for approval" }, 409);
  }

  const client = (invoice as any).clients as { name?: string | null; email?: string | null } | null;
  const clientEmail = client?.email?.trim();
  if (!clientEmail) {
    return json({ error: "This client has no email address on file" }, 400);
  }

  // The creator gets a copy. Their address lives on auth.users; fall back to
  // whoever is sending when the row predates created_by or the user is gone.
  let creatorEmail: string | null = null;
  if (invoice.created_by) {
    const { data, error } = await admin.auth.admin.getUserById(invoice.created_by);
    if (error || !data?.user?.email) {
      console.warn(`Could not resolve email for estimate creator ${invoice.created_by}:`, error?.message);
    } else {
      creatorEmail = data.user.email;
    }
  }
  if (!creatorEmail) creatorEmail = caller.email ?? null;

  const recipients = Array.from(new Set(
    [clientEmail, creatorEmail].filter((e): e is string => !!e).map((e) => e.toLowerCase()),
  ));

  const { data: company } = await admin
    .from("company")
    .select("business_name")
    .limit(1)
    .maybeSingle();
  const businessName = company?.business_name || "HandyTally";

  const approveUrl = `${appOrigin}/approve?token=${encodeURIComponent(invoice.approval_token)}`;

  const html = buildEmailHtml({
    subject: subject.trim(),
    message: message ?? "",
    document,
    total: invoice.total,
    approveUrl,
    businessName,
  });

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: INVOICE_FROM_ADDRESS,
        to: recipients,
        subject: subject.trim(),
        html,
        ...(INVOICE_REPLY_TO ? { reply_to: INVOICE_REPLY_TO } : {}),
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      // 400 rather than 502: Cloudflare fronts the self-hosted instance and
      // replaces origin 502s with its own page, so the reason would be lost.
      console.error("Resend rejected the send:", result);
      return json(
        { error: result?.message ?? "The email provider rejected the request" },
        400,
      );
    }

    console.log(`Estimate #${invoice.invoice_number} sent for approval to ${recipients.join(", ")} by ${caller.email}`);
    return json({ id: result?.id ?? null, sentTo: recipients }, 200);
  } catch (error) {
    console.error("Error sending the approval email:", error);
    return json({ error: "Failed to send the approval email" }, 500);
  }
});
