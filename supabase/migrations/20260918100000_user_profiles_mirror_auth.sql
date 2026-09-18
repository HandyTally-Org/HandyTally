-- HT-65 (B): public.user_profiles mirrors auth.users one to one.
--
-- The repo has always carried handle_new_user() and the on_auth_user_created
-- trigger (20250723032906 / 20250723082424), but they were never installed on
-- the live database, so accounts created in the Supabase dashboard or before
-- the trigger existed have no profile row and the invite-user function had to
-- upsert one by hand. This migration:
--
--   1. re-creates the function and trigger idempotently, so the repo and
--      production agree from now on (a profile row per auth.users insert);
--   2. backfills a profile for every auth.users row that lacks one;
--   3. drops user_profiles.organization_id, which predates
--      organization_memberships and is read by nothing in web/, admin-app/ or
--      the edge functions (only the fallback in auto_set_organization_id,
--      re-created here without it). NULL was its only value in production.
--
-- Smoke check after applying (must return 0, and stay 0 after creating a user
-- through the Supabase dashboard):
--   select count(*) from auth.users u
--   left join public.user_profiles p on p.id = u.id
--   where p.id is null;

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Trigger: one profile row per auth account
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  insert into public.user_profiles (id, email, first_name, last_name)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Backfill the accounts that predate the trigger
-- ---------------------------------------------------------------------------
insert into public.user_profiles (id, email, first_name, last_name)
select
  u.id,
  coalesce(u.email, ''),
  u.raw_user_meta_data->>'first_name',
  u.raw_user_meta_data->>'last_name'
from auth.users u
left join public.user_profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Retire user_profiles.organization_id
-- ---------------------------------------------------------------------------
-- auto_set_organization_id is re-created from its newest definition
-- (20260917150000_tenant_header_hardening.sql) minus its last-resort read of
-- the column: a user with no active membership and no hostname tenant simply
-- gets no organization_id, and the tenant policies (HT-55) refuse the write,
-- which is the correct answer.
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

  -- 1. A value already on the row wins when the caller may use it.
  if new.organization_id is not null then
    if caller_is_superuser or exists (
      select 1 from organization_memberships
      where user_id = auth.uid()
        and organization_id = new.organization_id
        and is_active = true
    ) then
      return new;
    end if;
  end if;

  -- 2. The tenant the browser is on (x-tenant-subdomain header, HT-38).
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

  -- 3. No tenant on the request: best active membership, for superusers too.
  --    (HT-65 removed the fallback to the legacy user_profiles.organization_id
  --    column that followed this for non-superusers.)
  select om.organization_id into user_org_id
  from organization_memberships om
  where om.user_id = auth.uid() and om.is_active = true
  order by case when om.role = 'admin' then 1 else 2 end
  limit 1;

  if user_org_id is not null then
    new.organization_id := user_org_id;
  end if;

  return new;
end;
$function$;

alter table public.user_profiles drop column if exists organization_id;
