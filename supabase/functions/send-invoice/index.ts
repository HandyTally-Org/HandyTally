// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Resend is used for outbound mail. Set these in the project's function secrets:
//   RESEND_API_KEY        - API key from the Resend dashboard
//   INVOICE_FROM_ADDRESS  - verified sender, e.g. "HandyTally <invoices@handytally.com>"
//   INVOICE_REPLY_TO      - optional, where client replies should land
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") as string;
const INVOICE_FROM_ADDRESS = Deno.env.get("INVOICE_FROM_ADDRESS") as string;
const INVOICE_REPLY_TO = Deno.env.get("INVOICE_REPLY_TO");

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
  // Not populated yet. When PDF rendering is added, Resend takes
  // [{ filename, content }] where content is a base64 string.
  attachments?: { filename: string; content: string }[];
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

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

  const { to, subject, html, attachments } = payload ?? {};
  if (!to || !subject || !html) {
    return json({ error: "to, subject and html are all required" }, 400);
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
        ...(attachments?.length ? { attachments } : {}),
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      // Surface the provider's reason so the caller can show something useful.
      console.error("Resend rejected the send:", result);
      return json(
        { error: result?.message ?? "The email provider rejected the request" },
        502,
      );
    }

    return json({ id: result?.id ?? null }, 200);
  } catch (error) {
    console.error("Error sending invoice email:", error);
    return json({ error: "Failed to send the invoice email" }, 500);
  }
});
