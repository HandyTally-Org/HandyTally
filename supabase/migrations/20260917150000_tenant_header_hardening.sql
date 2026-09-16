-- HT-55 follow-up: three fixes found while verifying tenant isolation.
--
-- 1. request_tenant_subdomain() crashed with "invalid input syntax for type
--    json" when request.headers had been set earlier in the session and then
--    reset: current_setting(..., true) returns '' rather than NULL for such a
--    placeholder. Treat '' as "no header".
--
-- 2. Rows created with no tenant on the request (handytally.com, native app)
--    by a superuser were left with organization_id = NULL, an intentional
--    carry-over from the 2025 trigger. On a scoped database a NULL row is
--    invisible on every customer host and only a superuser on the apex can
--    see it, which is never what anyone wants. Superusers now get their best
--    active membership like everyone else; only a superuser with no
--    membership at all still leaves NULL.
--
-- 3. Data: the rows created since HT-40 with no organization are WGElectric's
--    (created by support@wgelectricus.com while testing; the demo data had
--    already been moved). Assign them to wgelectricus. Guarded by
--    `organization_id is null`, so re-running is a no-op.
--
-- The web app bug that made this visible (three screens used their own
-- Supabase client with no tenant header) is fixed in the same PR.

set check_function_bodies = off;

create or replace function public.request_tenant_subdomain()
 returns text
 language sql
 stable
as $function$
  select nullif(
    lower(trim(
      coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'x-tenant-subdomain'
    )),
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
  select om.organization_id into user_org_id
  from organization_memberships om
  where om.user_id = auth.uid() and om.is_active = true
  order by case when om.role = 'admin' then 1 else 2 end
  limit 1;

  if user_org_id is null and not caller_is_superuser then
    select up.organization_id into user_org_id
    from user_profiles up
    where up.id = auth.uid();
  end if;

  if user_org_id is not null then
    new.organization_id := user_org_id;
  end if;

  return new;
end;
$function$;

-- Orphaned rows created since HT-40 belong to WGElectric.
do $$
declare
  wg_id uuid;
begin
  select id into wg_id from public.organizations where subdomain = 'wgelectricus';
  if wg_id is null then
    raise exception 'no organization with subdomain wgelectricus';
  end if;
  update public.clients          set organization_id = wg_id where organization_id is null;
  update public.jobs             set organization_id = wg_id where organization_id is null;
  update public.job_costs        set organization_id = wg_id where organization_id is null;
  update public.jobs_attachments set organization_id = wg_id where organization_id is null;
  update public.invoices         set organization_id = wg_id where organization_id is null;
  update public.invoice_items    set organization_id = wg_id where organization_id is null;
  update public.materials        set organization_id = wg_id where organization_id is null;
  update public.services         set organization_id = wg_id where organization_id is null;
  update public.notes            set organization_id = wg_id where organization_id is null;
end
$$;
