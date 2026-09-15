// calendar-connect: lets a signed-in user connect (and disconnect) their own
// calendar through Nylas hosted auth. HT-1.
//
// The stored grant is what upsert-calendar-event uses to push that user's jobs
// to their calendar, and what HT-11 will use to send mail as them.
//
// Flow
// ----
//   1. App  -> POST { action: "start", redirectUri }        (user token)
//      <- { url }   Nylas hosted-auth URL; the app navigates to it.
//   2. Nylas (Google consent) redirects the browser back to redirectUri with
//      ?code=...&state=...
//   3. App  -> POST { action: "exchange", code, state }     (user token)
//      <- { email, provider }  The grant is stored in email_integrations.
//   4. App  -> POST { action: "disconnect" }                (user token)
//      <- { ok: true }  The grant is revoked at Nylas and the row deleted.
//
// Why the exchange goes through the app and not a bare redirect endpoint: the
// callback must run under the session of the person who started the flow.
// `state` is an HMAC-signed { user, redirectUri, exp } minted at "start"; at
// "exchange" it must verify AND name the same user as the bearer token. That
// stops the classic login-CSRF where an attacker starts a flow, hands the
// half-finished URL to a victim, and the victim's calendar ends up attached to
// the attacker's account.
//
// Secrets
// -------
//   NYLAS_API_KEY, NYLAS_API_URI   as for upsert-calendar-event
//   NYLAS_CLIENT_ID                the Nylas application's client id
//   SUPABASE_SERVICE_ROLE_KEY      injected; used for the writes (RLS allows
//                                  users to read their own row only) and as
//                                  the HMAC key for `state`
//
// The redirectUri the app sends must be registered as a callback URI on the
// Nylas application, or Nylas refuses the flow.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Nylas from "nylas";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "supabase-js";

const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY") as string;
const NYLAS_API_URI = Deno.env.get("NYLAS_API_URI") || "https://api.us.nylas.com";
const NYLAS_CLIENT_ID = Deno.env.get("NYLAS_CLIENT_ID") as string;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

// How long a started flow stays valid. Google's consent screen takes seconds;
// ten minutes leaves room for account pickers and 2FA.
const STATE_TTL_SECONDS = 10 * 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

// @ts-expect-error no-call-signatures
const nylas = new Nylas({ apiKey: NYLAS_API_KEY, apiUri: NYLAS_API_URI });

// Service-role client: the only writer to email_integrations.
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type StartRequest = { action: "start"; redirectUri: string; provider?: string };
type ExchangeRequest = { action: "exchange"; code: string; state: string };
type DisconnectRequest = { action: "disconnect" };
type ConnectRequest = StartRequest | ExchangeRequest | DisconnectRequest;

type StatePayload = { user: string; redirectUri: string; exp: number };

// ---------------------------------------------------------------------------
// Signed state
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromB64url = (s: string) => {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

let hmacKey: CryptoKey | null = null;
const getHmacKey = async () => {
  if (!hmacKey) {
    hmacKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(SUPABASE_SERVICE_ROLE_KEY),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }
  return hmacKey;
};

const signState = async (payload: StatePayload): Promise<string> => {
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await getHmacKey(), encoder.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
};

const verifyState = async (state: string): Promise<StatePayload | null> => {
  const dot = state.indexOf(".");
  if (dot < 0) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      "HMAC",
      await getHmacKey(),
      fromB64url(sig),
      encoder.encode(body),
    );
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const payload = JSON.parse(decoder.decode(fromB64url(body))) as StatePayload;
    if (!payload.user || !payload.redirectUri || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const start = async (userId: string, body: StartRequest) => {
  const { redirectUri, provider } = body;
  if (!redirectUri || !/^https?:\/\//.test(redirectUri)) {
    return json({ error: "redirectUri is required" }, 400);
  }

  const state = await signState({
    user: userId,
    redirectUri,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  });

  // Scopes come from the connector configured on the Nylas application, so
  // adding mail scopes for HT-11 is a dashboard change, not a code change.
  const url = nylas.auth.urlForOAuth2({
    clientId: NYLAS_CLIENT_ID,
    redirectUri,
    // Nylas' Provider enum; "google" and "microsoft" are the two we expect.
    provider: (provider || "google") as any,
    state,
  });

  return json({ url }, 200);
};

const exchange = async (userId: string, body: ExchangeRequest) => {
  const { code, state } = body;
  if (!code || !state) {
    return json({ error: "code and state are required" }, 400);
  }

  const payload = await verifyState(state);
  if (!payload) {
    return json({ error: "This connection attempt has expired. Start again." }, 400);
  }
  if (payload.user !== userId) {
    // Started by someone else: see the login-CSRF note at the top.
    return json({ error: "This connection attempt belongs to a different user." }, 403);
  }

  let grant: { grantId: string; email?: string; provider?: string };
  try {
    grant = await nylas.auth.exchangeCodeForToken({
      clientId: NYLAS_CLIENT_ID,
      clientSecret: NYLAS_API_KEY,
      code,
      redirectUri: payload.redirectUri,
    });
  } catch (error) {
    console.error("Nylas code exchange failed:", error);
    return json({ error: "The calendar provider rejected the connection. Try again." }, 400);
  }

  // Pick the primary calendar now so the webhook never has to.
  let calendarId: string | null = null;
  try {
    const calendars = await nylas.calendars.list({ identifier: grant.grantId });
    const writable = (calendars.data ?? []).filter((c: any) => !c.readOnly);
    const primary = writable.find((c: any) => c.isPrimary) ?? writable[0];
    calendarId = primary?.id ?? null;
  } catch (error) {
    // Not fatal: upsert-calendar-event falls back to "primary", which Google
    // and Microsoft both understand.
    console.warn("Could not list calendars for new grant:", error);
  }

  // Replacing an existing connection: revoke the old grant so Nylas stops
  // billing for it and the provider no longer lists us as authorised.
  const { data: existing } = await admin
    .from("email_integrations")
    .select("grant_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.grant_id && existing.grant_id !== grant.grantId) {
    await revokeQuietly(existing.grant_id);
  }

  const { error } = await admin
    .from("email_integrations")
    .upsert(
      {
        user_id: userId,
        provider: grant.provider || "google",
        email: grant.email ?? null,
        grant_id: grant.grantId,
        calendar_id: calendarId,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("Failed to store grant:", error);
    // The grant exists at Nylas but we could not record it; revoke so the
    // user is not left connected to nothing.
    await revokeQuietly(grant.grantId);
    return json({ error: "Could not save the connection" }, 500);
  }

  return json({ email: grant.email ?? null, provider: grant.provider || "google" }, 200);
};

const disconnect = async (userId: string) => {
  const { data: row, error } = await admin
    .from("email_integrations")
    .select("grant_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to read connection:", error);
    return json({ error: "Could not read the connection" }, 500);
  }
  if (!row) {
    return json({ ok: true }, 200);
  }

  await revokeQuietly(row.grant_id);

  const { error: deleteError } = await admin
    .from("email_integrations")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    console.error("Failed to delete connection:", deleteError);
    return json({ error: "Could not remove the connection" }, 500);
  }

  return json({ ok: true }, 200);
};

// Revoking is best-effort: a grant the user already removed from their Google
// account returns 404, and that is not a reason to keep the row.
const revokeQuietly = async (grantId: string) => {
  try {
    await nylas.grants.destroy({ grantId });
  } catch (error) {
    console.warn(`Could not revoke grant ${grantId}:`, (error as any)?.message ?? error);
  }
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  if (!NYLAS_API_KEY || !NYLAS_CLIENT_ID || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing NYLAS_API_KEY, NYLAS_CLIENT_ID or SUPABASE_SERVICE_ROLE_KEY");
    return json({ error: "Calendar connections are not configured on the server" }, 500);
  }

  // Resolve the bearer token to a user. The gateway's JWT check alone would
  // let the public anon key through (same reasoning as send-invoice).
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const { data: { user }, error: authError } = await createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authHeader } } },
  ).auth.getUser();
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: ConnectRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  try {
    switch (body?.action) {
      case "start":
        return await start(user.id, body);
      case "exchange":
        return await exchange(user.id, body);
      case "disconnect":
        return await disconnect(user.id);
      default:
        return json({ error: "action must be start, exchange or disconnect" }, 400);
    }
  } catch (error) {
    console.error("calendar-connect failed:", error);
    return json({ error: "Internal Server Error" }, 500);
  }
});
