-- HT-40: give WGElectric a clean organization and move the existing data to
-- a demo organization.
--
-- State on 2026-09-16 (read from the live database):
--   organizations: acme-13, acme-14, acme-15, acme-demo, demo, demo-now and
--     wgelectric, all 'active'. Only demo and wgelectric are real.
--   memberships: support@wgelectricus.com is admin of wgelectric and
--     lrfittipaldi@gmail.com a technician there; admin@handytally.com is admin
--     of acme-13 (and a superuser, so the membership is irrelevant).
--   data: 1 client, 1 job, 1 invoice with 4 items, 14 materials, 13 services,
--     2 notes, 1 company row with 5 attachments, every one of them with
--     organization_id = NULL.
--
-- Decided by Lucas on 2026-09-16 (HT-26 / HT-40): the NULL rows are demo
-- data, not WGElectric's. They move to the `demo` organization so that
-- demo.handytally.com is a sandbox for showing the product, and WGElectric
-- starts empty. The one exception is the company profile (logo, invoice
-- header): that is WGElectric's and goes to wgelectric. The five test
-- organizations are set to 'inactive' rather than deleted: an inactive row
-- no longer resolves from a hostname (get_organization_by_subdomain only
-- returns active rows) but nothing is lost.
--
-- Idempotent: every update is guarded by `organization_id is null` or by the
-- current status, so re-running it is a no-op. The auto_set_organization_id
-- triggers fire on these updates but leave an explicit organization_id alone
-- (psql has no auth.uid(), so the trigger's fallbacks find nothing).
--
-- Not done here: a NOT NULL constraint on organization_id. Superusers working
-- on the apex still insert rows with no tenant, so that has to wait for the
-- apex to stop serving the app (HT-43).

do $$
declare
  demo_id uuid;
  wg_id uuid;
begin
  select id into demo_id from public.organizations where subdomain = 'demo';
  select id into wg_id from public.organizations where subdomain = 'wgelectric';

  if demo_id is null then
    raise exception 'HT-40: no organization with subdomain demo';
  end if;
  if wg_id is null then
    raise exception 'HT-40: no organization with subdomain wgelectric';
  end if;

  -- The two real organizations are active; the test ones are not.
  update public.organizations
     set status = 'active', updated_at = now()
   where id in (demo_id, wg_id) and status <> 'active';

  update public.organizations
     set status = 'inactive', updated_at = now()
   where subdomain in ('acme-13', 'acme-14', 'acme-15', 'acme-demo', 'demo-now')
     and status <> 'inactive';

  -- Demo data -> demo organization.
  update public.clients          set organization_id = demo_id where organization_id is null;
  update public.jobs             set organization_id = demo_id where organization_id is null;
  update public.job_costs        set organization_id = demo_id where organization_id is null;
  update public.jobs_attachments set organization_id = demo_id where organization_id is null;
  update public.invoices         set organization_id = demo_id where organization_id is null;
  update public.invoice_items    set organization_id = demo_id where organization_id is null;
  update public.materials        set organization_id = demo_id where organization_id is null;
  update public.services         set organization_id = demo_id where organization_id is null;
  update public.notes            set organization_id = demo_id where organization_id is null;

  -- The company profile belongs to WGElectric.
  update public.company             set organization_id = wg_id where organization_id is null;
  update public.company_attachments set organization_id = wg_id where organization_id is null;
end
$$;
