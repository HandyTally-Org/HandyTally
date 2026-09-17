// delete-user: remove a person's HandyTally account entirely. HT-65.
//
// Called by the Admin > Users page (web/utils/inviteUser.ts) with the admin's
// session token and a body of
//   { userId, organizationId }
//
// organizationId is the organisation the admin is acting from; it decides
// whether an organisation admin may delete this account at all (see the rules
// below). Deleting the auth.users row cascades to user_profiles and
// organization_memberships; jobs, notes, invoices, job costs, settings and
// audit rows the person touched are kept with their user column set to null
// (the HT-65 migration changed every remaining "no action" foreign key).
//
// Rules, all enforced here with the service role (the RPCs would see no
// auth.uid() from us) and, for superusers, again by a database trigger:
//   - the caller must be an active admin of organizationId, or a superuser
//   - nobody deletes their own account
//   - superuser accounts are never deleted
//   - an organisation admin may only delete an account whose memberships are
//     all in organisations that admin administers; otherwise the answer is
//     "remove them from this organisation instead", so one company can never
//     delete another company's user
//   - a superuser may delete any non-superuser account
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (injected).

// URL imports only: the self-hosted edge runtime has no import map.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

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

type DeleteRequest = {
  userId: string;
  organizationId: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

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

  let body: DeleteRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const userId = (body?.userId ?? "").trim();
  const organizationId = (body?.organizationId ?? "").trim();
  if (!userId || !organizationId) {
    return json({ error: "userId and organizationId are required" }, 400);
  }
  if (userId === caller.id) {
    return json({ error: "You cannot delete your own account" }, 400);
  }

  // --- Who is the caller? ----------------------------------------------------
  const { data: callerProfile } = await supabase
    .from("user_profiles")
    .select("role, is_active")
    .eq("id", caller.id)
    .maybeSingle();
  const callerIsSuperuser = callerProfile?.role === "superuser" && callerProfile?.is_active === true;

  if (!callerIsSuperuser) {
    const { data: adminMembership } = await supabase
      .from("organization_memberships")
      .select("id")
      .eq("user_id", caller.id)
      .eq("organization_id", organizationId)
      .eq("role", "admin")
      .eq("is_active", true)
      .maybeSingle();
    if (!adminMembership) {
      return json({ error: "Only organization admins can delete users" }, 403);
    }
  }

  // --- Who is being deleted? -------------------------------------------------
  const { data: target } = await supabase
    .from("user_profiles")
    .select("id, email, role")
    .eq("id", userId)
    .maybeSingle();
  if (!target) {
    return json({ error: "That account no longer exists" }, 404);
  }
  if (target.role === "superuser") {
    return json({ error: "Superuser accounts are platform-wide and cannot be deleted" }, 403);
  }

  // An organisation admin may only delete someone whose every membership is
  // in an organisation that admin runs. Anything else is a Remove, not a Delete.
  if (!callerIsSuperuser) {
    const { data: targetMemberships, error: membershipsError } = await supabase
      .from("organization_memberships")
      .select("organization_id")
      .eq("user_id", userId);
    if (membershipsError) {
      console.error("Could not read the target's memberships:", membershipsError);
      return json({ error: "Could not check the account's organizations" }, 500);
    }
    const { data: callerAdminOf } = await supabase
      .from("organization_memberships")
      .select("organization_id")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .eq("is_active", true);
    const administered = new Set((callerAdminOf ?? []).map((m) => m.organization_id));
    const foreign = (targetMemberships ?? []).some((m) => !administered.has(m.organization_id));
    if (foreign) {
      return json(
        {
          error:
            "This person also belongs to an organization you do not administer. Remove them from this organization instead of deleting the account.",
          code: "foreign_membership",
        },
        403,
      );
    }
  }

  // --- Delete -----------------------------------------------------------------
  // The BEFORE DELETE trigger on auth.users refuses superusers a second time;
  // its message comes back here as the error.
  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error("deleteUser failed:", deleteError);
    return json({ error: deleteError.message ?? "Could not delete the account" }, 400);
  }

  return json({ deleted: true, userId, email: target.email }, 200);
});
