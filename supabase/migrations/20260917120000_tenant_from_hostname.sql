-- HT-38: the hostname picks the tenant.
--
-- Every customer subdomain (*.handytally.com, HT-37) serves the same bundle.
-- The web app reads the subdomain from window.location, resolves it to an
-- organization before anyone signs in, and requires the signed-in user to be
-- a member of that organization. Two things have to happen in the database:
--
-- 1. get_organization_by_subdomain(text): the anon role must be able to turn
--    a subdomain into { id, name } for the login screen and the "no company at
--    this address" page, without being granted a read on organizations
--    itself. SECURITY DEFINER, returns only active rows and only four columns.
--
-- 2. auto_set_organization_id(): the BEFORE INSERT/UPDATE trigger that stamps
--    organization_id used to take the caller's "best" membership, so a user
--    with two memberships could write a row into the wrong organization no
--    matter which host they were on. The web client now sends the subdomain
--    it is running on as the `x-tenant-subdomain` request header
--    (web/lib/supabase.ts); PostgREST exposes request headers to SQL as the
--    `request.headers` setting, so the trigger can stamp the organization the
--    browser is actually on, after checking the caller is a member of it.
--    Precedence: a value already on the row (if the caller may use it) >
--    the request's tenant > the old best-membership fallback. Superusers keep
--    NULL when nothing selects an organization, as before.
--
-- Apply by hand on the Coolify host before merging the PR (see
-- Docs/architecture.md §8); the app calls the new function on every page load
-- of a customer subdomain.

set check_function_bodies = off;

create or replace function public.get_organization_by_subdomain(p_subdomain text)
 returns table (id uuid, name text, subdomain text, status text)
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  select o.id, o.name::text, o.subdomain::text, o.status::text
  from public.organizations o
  where o.subdomain = lower(trim(p_subdomain))
    and o.status = 'active'
  limit 1;
$function$;

revoke all on function public.get_organization_by_subdomain(text) from public;
grant execute on function public.get_organization_by_subdomain(text) to anon, authenticated, service_role;

-- The subdomain the calling browser is on, or NULL when the request carries
-- no x-tenant-subdomain header (apex, www, localhost, native app, psql).
create or replace function public.request_tenant_subdomain()
 returns text
 language sql
 stable
as $function$
  select nullif(
    lower(trim(coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-tenant-subdomain')),
    ''
  );
$function$;

create or replace function public.auto_set_organization_id()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  caller_is_superuser boolean;
  tenant_subdomain text;
  tenant_org_id uuid;
  user_org_id uuid;
begin
  caller_is_superuser := exists (
    select 1 from user_profiles
    where id = auth.uid() and role = 'superuser' and is_active = true
  );

  -- 1. A value already on the row wins when the caller may use it. Covers
  --    updates (the row keeps its organization) and explicit stamping by
  --    superusers or by members of that organization.
  if new.organization_id is not null then
    if caller_is_superuser or exists (
      select 1 from organization_memberships
      where user_id = auth.uid()
        and organization_id = new.organization_id
        and is_active = true
    ) then
      return new;
    end if;
    -- A member of another organization put a foreign id on the row: ignore
    -- it and derive the organization below, as the old trigger did.
  end if;

  -- 2. The tenant the browser is on.
  tenant_subdomain := public.request_tenant_subdomain();
  if tenant_subdomain is not null then
    select o.id into tenant_org_id
    from organizations o
    where o.subdomain = tenant_subdomain and o.status = 'active';

    if tenant_org_id is null then
      raise exception 'No active organization at subdomain "%"', tenant_subdomain
        using errcode = 'P0002';
    end if;

    if caller_is_superuser or exists (
      select 1 from organization_memberships
      where user_id = auth.uid()
        and organization_id = tenant_org_id
        and is_active = true
    ) then
      new.organization_id := tenant_org_id;
      return new;
    end if;

    raise exception 'You are not a member of the organization at subdomain "%"', tenant_subdomain
      using errcode = '42501';
  end if;

  -- 3. No tenant on the request: the previous behaviour. Superusers keep an
  --    explicit NULL; everyone else gets their best active membership, then
  --    the legacy user_profiles.organization_id.
  if caller_is_superuser then
    return new;
  end if;

  select om.organization_id into user_org_id
  from organization_memberships om
  where om.user_id = auth.uid() and om.is_active = true
  order by case when om.role = 'admin' then 1 else 2 end
  limit 1;

  if user_org_id is null then
    select up.organization_id into user_org_id
    from user_profiles up
    where up.id = auth.uid() and up.role != 'superuser';
  end if;

  if user_org_id is not null then
    new.organization_id := user_org_id;
  end if;

  return new;
end;
$function$;
