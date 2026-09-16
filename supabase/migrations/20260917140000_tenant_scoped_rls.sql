-- HT-55: scope every read and write to the organization the browser is on.
--
-- WHERE THINGS STOOD (live database, 2026-09-16)
-- ----------------------------------------------
-- The 2025 schema created `USING (true)` policies granted to PUBLIC on every
-- application table. HT-14 (20260909200000_restrict_anon_access.sql) re-points
-- them to `authenticated` but was never applied (HT-28): an anonymous
-- `GET /rest/v1/jobs` with the public anon key still returned rows today.
-- PostgreSQL ORs permissive policies, so the organisation-scoped policies
-- from 20250808010055 never restricted anything either. Result: any caller,
-- signed in or not, could read and change every organisation's data, and a
-- WGElectric member at wgelectric.handytally.com saw the demo data.
--
-- WHAT THIS DOES
-- --------------
-- 1. Rebinds the five auto_set_organization_id triggers that were created on
--    the wrong table (documented in 20260909200000), so invoice_items,
--    job_calendar_events, job_costs, jobs_attachments and company_attachments
--    get stamped like everything else.
-- 2. Adds current_organization_id(): the active organisation for the request's
--    x-tenant-subdomain header (HT-38), NULL when the request has no tenant,
--    and the all-zero uuid when the header names an unknown subdomain so that
--    nothing matches.
-- 3. Adds tenant_row_visible(organization_id): on a tenant host the row must
--    belong to that organisation and the caller must be able to access it; on
--    the apex (no tenant) the caller's active memberships apply and superusers
--    see everything, as they do today.
-- 4. Drops every policy on the organisation-scoped tables and creates one
--    `tenant_scoped` policy per table, FOR ALL TO authenticated, with the same
--    expression as USING and WITH CHECK. The HT-38 trigger stamps the same
--    organisation before WITH CHECK runs, so inserts pass. Nothing is granted
--    to anon: with no policy for it, anon sees nothing.
-- 5. Re-points the remaining PUBLIC policies on profiles and
--    email_integrations (no organization_id) to `authenticated`, which is the
--    part of HT-14 that still applies.
--
-- Prerequisites: HT-38 (header + trigger, applied) and HT-40 (no rows with a
-- NULL organization_id, applied). Apply by hand on the Coolify host; it
-- verifies itself and aborts if any PUBLIC policy survives.
--
-- ROLLBACK if a signed-in user sees an empty app that should not be empty:
-- re-run 20250808010055's policy section for the affected table, or (fast)
--   create policy emergency_open on public.<table> for all to authenticated
--     using (true) with check (true);
-- and investigate. Do not grant anything to PUBLIC again.

set check_function_bodies = off;

begin;

-- ---------------------------------------------------------------------------
-- 1. Triggers on the right tables
-- ---------------------------------------------------------------------------
drop trigger if exists auto_set_org_id_invoice_items        on public.invoices;
drop trigger if exists auto_set_org_id_job_calendar_events  on public.jobs;
drop trigger if exists auto_set_org_id_jobs_costs           on public.materials;
drop trigger if exists auto_set_org_id_jobs_attachments     on public.services;
drop trigger if exists auto_set_org_id_company_attachments  on public.company;

drop trigger if exists auto_set_org_id_invoice_items        on public.invoice_items;
drop trigger if exists auto_set_org_id_job_calendar_events  on public.job_calendar_events;
drop trigger if exists auto_set_org_id_job_costs            on public.job_costs;
drop trigger if exists auto_set_org_id_jobs_attachments     on public.jobs_attachments;
drop trigger if exists auto_set_org_id_company_attachments  on public.company_attachments;

create trigger auto_set_org_id_invoice_items
  before insert or update on public.invoice_items
  for each row execute function public.auto_set_organization_id();
create trigger auto_set_org_id_job_calendar_events
  before insert or update on public.job_calendar_events
  for each row execute function public.auto_set_organization_id();
create trigger auto_set_org_id_job_costs
  before insert or update on public.job_costs
  for each row execute function public.auto_set_organization_id();
create trigger auto_set_org_id_jobs_attachments
  before insert or update on public.jobs_attachments
  for each row execute function public.auto_set_organization_id();
create trigger auto_set_org_id_company_attachments
  before insert or update on public.company_attachments
  for each row execute function public.auto_set_organization_id();

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

-- The organisation the request is for. NULL: no tenant on the request (apex,
-- www, localhost, native app, psql). All-zero uuid: the header names a
-- subdomain that is not an active organisation, so no row can match.
create or replace function public.current_organization_id()
 returns uuid
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  select case
    when public.request_tenant_subdomain() is null then null
    else coalesce(
      (select o.id from public.organizations o
        where o.subdomain = public.request_tenant_subdomain() and o.status = 'active'
        limit 1),
      '00000000-0000-0000-0000-000000000000'::uuid)
  end;
$function$;

-- Superuser, or an active member of org_id.
create or replace function public.can_access_organization(org_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  select public.is_superuser() or exists (
    select 1 from public.organization_memberships om
    where om.user_id = auth.uid()
      and om.organization_id = org_id
      and om.is_active = true
  );
$function$;

-- The single policy expression. row_org_id is the row's organization_id.
create or replace function public.tenant_row_visible(row_org_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  select case
    when public.current_organization_id() is null
      then public.can_access_organization(row_org_id)
    else row_org_id = public.current_organization_id()
      and public.can_access_organization(public.current_organization_id())
  end;
$function$;

revoke all on function public.current_organization_id() from public;
revoke all on function public.can_access_organization(uuid) from public;
revoke all on function public.tenant_row_visible(uuid) from public;
grant execute on function public.current_organization_id() to authenticated, service_role;
grant execute on function public.can_access_organization(uuid) to authenticated, service_role;
grant execute on function public.tenant_row_visible(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. One tenant-scoped policy per table
-- ---------------------------------------------------------------------------
do $$
declare
  scoped_tables text[] := array[
    'clients', 'company', 'company_attachments', 'invoice_items', 'invoices',
    'job_calendar_events', 'job_costs', 'jobs', 'jobs_attachments',
    'materials', 'services', 'notes'
  ];
  t text;
  r record;
  dropped int := 0;
  leftover int;
begin
  foreach t in array scoped_tables loop
    for r in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', r.policyname, t);
      dropped := dropped + 1;
    end loop;

    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy tenant_scoped on public.%I for all to authenticated '
      'using (public.tenant_row_visible(organization_id)) '
      'with check (public.tenant_row_visible(organization_id))', t);
  end loop;
  raise notice 'Replaced % policies with one tenant_scoped policy on % tables', dropped, array_length(scoped_tables, 1);

  -- Tables without organization_id: signed-in users only (the HT-14 step).
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'email_integrations')
      and 'public' = any (roles)
  loop
    execute format('alter policy %I on public.%I to authenticated', r.policyname, r.tablename);
  end loop;

  -- Verify: no PUBLIC-role policy survives on any application table.
  select count(*) into leftover
  from pg_policies
  where schemaname = 'public'
    and (tablename = any (scoped_tables) or tablename in ('profiles', 'email_integrations'))
    and 'public' = any (roles);
  if leftover > 0 then
    raise exception 'Aborting: % PUBLIC-role policies still present on application tables', leftover;
  end if;
end
$$;

commit;

-- ===========================================================================
-- POST-DEPLOY CHECK
-- ===========================================================================
--   set role anon;  select count(*) from public.jobs;  reset role;   -- 0
--   select tablename, count(*) from pg_policies where schemaname = 'public'
--     group by 1 order by 1;                                            -- 1 per scoped table
-- Then in the app: support@wgelectricus.com at wgelectric.handytally.com
-- sees an empty app with the WGElectric company profile; the same account at
-- demo.handytally.com sees the demo data; at handytally.com sees everything.
