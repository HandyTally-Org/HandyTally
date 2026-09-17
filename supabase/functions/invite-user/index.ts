// invite-user: an organisation admin invites someone into their organisation
// as admin, member or technician. HT-12.
//
// Called by the Admin > Users page (web/utils/inviteUser.ts) with the admin's
// session token and a body of
//   { email, firstName, lastName, role, organizationId }
//
// What happens
// ------------
// 1. The bearer token is resolved to a user and that user must be an admin of
//    organizationId (an active membership with role = 'admin') or a
//    superuser. This mirrors public.is_org_admin(); it is re-done here with
//    the service role because the RPC would see no auth.uid() from us.
// 2. New address: the auth account is created through the Auth admin API
//    (generateLink type "invite"), which returns the one-time token for the
//    set-password page. The user_profiles row is written here (the repo's
//    handle_new_user() trigger is not installed on the live database). The
//    membership row is inserted with the requested role.
//    Existing address: no account is created; the membership is added (or
//    reactivated with the requested role) and the email just points at the
//    login page.
// 3. The email goes out through Resend, the same provider send-invoice uses.
//
// The link in the email goes straight to the web app at
//   <app origin>/set-password?token_hash=<token>&type=invite
// and the page exchanges the token for a session with verifyOtp. This avoids
// the GoTrue /verify redirect and the site_url allow-list entirely. The app
// origin is APP_URL when set, otherwise the request's Origin header, which is
// what the browser sends and what a local dev server needs.
//
// Secrets (shared with send-invoice)
// ----------------------------------
//   RESEND_API_KEY
//   INVOICE_FROM_ADDRESS       sender, e.g. "HandyTally <invoices@example.com>"
//   INVOICE_REPLY_TO           optional
//   APP_URL                    optional; pins the origin used in the link
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY  injected

// URL imports only: the self-hosted edge runtime has no import map. Same as
// send-invoice and upsert-calendar-event.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") as string;
const FROM_ADDRESS = Deno.env.get("INVOICE_FROM_ADDRESS") as string;
const REPLY_TO = Deno.env.get("INVOICE_REPLY_TO");
const APP_URL = Deno.env.get("APP_URL");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

// Service-role client: creates the auth user and writes the membership
// without depending on row-level-security policies.
const supabase = createClient(
  SUPABASE_URL,
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

// Roles an organisation admin may hand out. 'superuser' is deliberately
// absent: it is platform-wide and only set by hand.
const INVITABLE_ROLES = ["admin", "user", "technician"] as const;
type InvitableRole = (typeof INVITABLE_ROLES)[number];

const ROLE_LABELS: Record<InvitableRole, string> = {
  admin: "an administrator",
  user: "a member",
  technician: "a technician",
};

type InviteRequest = {
  email: string;
  firstName?: string;
  lastName?: string;
  role: InvitableRole;
  organizationId: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  );

// The Auth admin API has no lookup by email; the user list is small enough to
// scan one page of it.
const findAuthUserByEmail = async (email: string): Promise<{ id: string } | null> => {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    console.error("listUsers failed:", error);
    return null;
  }
  const match = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
  return match ? { id: match.id } : null;
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

  // The gateway only checks that the bearer is a JWT signed by this project,
  // and the public anon key satisfies that. Resolve it to a live session.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const { data: { user: caller }, error: authError } = await createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authHeader } } },
  ).auth.getUser();
  if (authError || !caller) {
    return json({ error: "Your session has expired. Please sign in again." }, 401);
  }

  if (!RESEND_API_KEY || !FROM_ADDRESS) {
    console.error("Missing RESEND_API_KEY or INVOICE_FROM_ADDRESS");
    return json({ error: "Email is not configured on the server" }, 500);
  }

  let body: InviteRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const email = (body?.email ?? "").trim().toLowerCase();
  const firstName = (body?.firstName ?? "").trim();
  const lastName = (body?.lastName ?? "").trim();
  const role = body?.role;
  const organizationId = body?.organizationId;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "A valid email address is required" }, 400);
  }
  if (!INVITABLE_ROLES.includes(role)) {
    return json({ error: "Role must be admin, user or technician" }, 400);
  }
  if (!organizationId) {
    return json({ error: "organizationId is required" }, 400);
  }

  // --- Is the caller allowed to invite into this organisation? -------------
  const { data: callerProfile } = await supabase
    .from("user_profiles")
    .select("role, is_active")
    .eq("id", caller.id)
    .maybeSingle();
  const isSuperuser = callerProfile?.role === "superuser" && callerProfile?.is_active === true;

  if (!isSuperuser) {
    const { data: adminMembership } = await supabase
      .from("organization_memberships")
      .select("id")
      .eq("user_id", caller.id)
      .eq("organization_id", organizationId)
      .eq("role", "admin")
      .eq("is_active", true)
      .maybeSingle();
    if (!adminMembership) {
      return json({ error: "Only organization admins can invite users" }, 403);
    }
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name, subdomain")
    .eq("id", organizationId)
    .maybeSingle();
  if (!organization) {
    return json({ error: "Organization not found" }, 404);
  }

  // HT-39: the set-password link must open on the host the admin invited
  // from (wgelectricus.handytally.com, not the apex), so the request's Origin
  // is used — but only when it is one of our hosts, since any authenticated
  // caller can put an arbitrary Origin header on a request and the link goes
  // into an email.
  const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?handytally\.com$|^http:\/\/localhost(:\d+)?$/;
  const requestOrigin = (req.headers.get("Origin") || "").replace(/\/+$/, "");
  // HT-65 (F): one bundle serves every subdomain, so an APP_URL pinned to one
  // host would send demo's invites to wgelectric's site. The validated request
  // Origin wins, then the organisation's own subdomain, and APP_URL only as a
  // last resort (a caller with no Origin and an organisation with no subdomain).
  const appOrigin =
    (ALLOWED_ORIGIN.test(requestOrigin) ? requestOrigin : "") ||
    (organization.subdomain ? `https://${organization.subdomain}.handytally.com` : "") ||
    (APP_URL || "").replace(/\/+$/, "");
  if (!appOrigin) {
    return json({ error: "Cannot build the invite link: the request origin is not a HandyTally host, the organization has no subdomain and APP_URL is not set" }, 500);
  }

  // --- Create the account, or find the existing one ------------------------
  // generateLink creates the user when the address is new and returns the
  // one-time token for the set-password page. When the address already has an
  // account it fails with "already been registered"; that is the signal to
  // add the membership only and send a plain "you've been added" email.
  let userId: string;
  let tokenHash: string | null = null;
  let existingAccount = false;

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { first_name: firstName, last_name: lastName } },
  });

  if (!linkError && linkData?.user) {
    userId = linkData.user.id;
    tokenHash = linkData.properties?.hashed_token ?? null;
  } else if (linkError && /already/i.test(linkError.message)) {
    existingAccount = true;
    const existing = await findAuthUserByEmail(email);
    if (!existing) {
      console.error(`Auth reports ${email} exists but it was not found in the user list`);
      return json({ error: "That email already has an account but it could not be found" }, 500);
    }
    userId = existing.id;
  } else {
    console.error("generateLink failed:", linkError);
    return json({ error: linkError?.message ?? "Could not create the account" }, 400);
  }

  if (!existingAccount && !tokenHash) {
    console.error("generateLink returned no hashed_token for", email);
    return json({ error: "Could not create the invitation link" }, 500);
  }

  // --- Profile --------------------------------------------------------------
  // list_organization_members() joins on user_profiles, so the row must exist.
  // The repo has a handle_new_user() trigger on auth.users for this, but it is
  // not installed on the live database (verified 2026-09-15), and accounts
  // from before it existed have no row either. Written here for every account
  // instead; an existing row is left untouched.
  const { error: profileError } = await supabase
    .from("user_profiles")
    .upsert(
      { id: userId, email, first_name: firstName || null, last_name: lastName || null },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (profileError) {
    console.error("Could not ensure the user profile:", profileError);
    return json({ error: "The account exists but its profile could not be written" }, 500);
  }

  // --- Membership -----------------------------------------------------------
  if (existingAccount) {
    const { data: current } = await supabase
      .from("organization_memberships")
      .select("id, is_active")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (current?.is_active) {
      return json({ error: `${email} is already a member of ${organization.name}` }, 409);
    }
  }

  const { error: membershipError } = await supabase
    .from("organization_memberships")
    .upsert(
      {
        user_id: userId,
        organization_id: organizationId,
        role,
        is_active: true,
        created_by: caller.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,organization_id" },
    );
  if (membershipError) {
    console.error("Could not write the membership:", membershipError);
    return json({ error: "The account was created but could not be added to the organization" }, 500);
  }

  // --- Email ----------------------------------------------------------------
  const orgName = escapeHtml(organization.name);
  const roleLabel = ROLE_LABELS[role];
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi,";
  const link = existingAccount
    ? `${appOrigin}/login`
    : `${appOrigin}/set-password?token_hash=${encodeURIComponent(tokenHash as string)}&type=invite`;
  const action = existingAccount ? "Sign in" : "Set your password";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #333;">
      <p>${greeting}</p>
      <p>You have been added to <strong>${orgName}</strong> on HandyTally as ${roleLabel}.</p>
      ${
        existingAccount
          ? `<p>Sign in with your existing HandyTally account to get started.</p>`
          : `<p>Choose a password to activate your account. This link can be used once.</p>`
      }
      <p style="margin: 24px 0;">
        <a href="${link}" style="background: #444444; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">${action}</a>
      </p>
      <p style="font-size: 12px; color: #666;">If the button does not work, copy this address into your browser:<br>${link}</p>
      <p style="font-size: 12px; color: #666;">If you were not expecting this, you can ignore this email.</p>
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
        from: FROM_ADDRESS,
        to: [email],
        subject: `You've been added to ${organization.name} on HandyTally`,
        html,
        ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      // 400 rather than 502: Cloudflare replaces origin 502s with its own page.
      console.error("Resend rejected the send:", result);
      return json(
        {
          error: `The account was set up but the email could not be sent: ${result?.message ?? "the email provider rejected the request"}`,
        },
        400,
      );
    }
  } catch (error) {
    console.error("Error sending the invitation email:", error);
    return json({ error: "The account was set up but the email could not be sent" }, 500);
  }

  return json({ userId, email, role, existingAccount }, 200);
});
