-- HT-50: one settings row per organisation for the Admin > Settings page.
--
-- Three jsonb documents, one per Settings feature, kept deliberately simple
-- for an experimental page:
--   nav            { "order": [<nav key>...], "hidden": [<nav key>...] }
--                  the sidebar order and the entries hidden from it (HT-50);
--                  keys are those in web/constants/navigation.ts, and a key
--                  the saved order does not know appends at the bottom so a
--                  release never hides a new screen.
--   labels         { "<section>": [{ value, label?, color?, textColor? }...] }
--                  renamed, recoloured and added status / tag values, in the
--                  OrganizationLabels shape of web/constants/labels.ts (HT-51).
--   custom_fields  { "<section>": [<field definition>...] } (HT-52 / HT-53).
--
-- Access follows HT-55's model: one tenant_scoped policy built on
-- tenant_row_visible(organization_id) for reads, so any active member sees
-- their organisation's row on every host; writes are restricted to admins
-- (and superusers) through is_org_admin(). Nothing is granted to anon. The
-- row is stamped by the same auto_set_organization_id trigger as the other
-- tables; the app still sends organization_id explicitly and upserts on it,
-- because requests from the apex, native and psql carry no tenant header.

begin;

create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  nav jsonb not null default '{}'::jsonb,
  labels jsonb not null default '{}'::jsonb,
  custom_fields jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

comment on table public.organization_settings is
  'HT-50: per-organisation Settings (sidebar order, label overrides, custom field definitions), one row per organisation.';

alter table public.organization_settings enable row level security;

drop trigger if exists auto_set_org_id_organization_settings on public.organization_settings;
create trigger auto_set_org_id_organization_settings
  before insert or update on public.organization_settings
  for each row execute function public.auto_set_organization_id();

-- Any active member of the organisation reads it (the drawer and every
-- label consumer need it before the first screen renders).
drop policy if exists tenant_scoped on public.organization_settings;
create policy tenant_scoped on public.organization_settings
  for select to authenticated
  using (public.tenant_row_visible(organization_id));

-- Only organisation admins and superusers change it.
drop policy if exists admin_writes on public.organization_settings;
create policy admin_writes on public.organization_settings
  for all to authenticated
  using (public.tenant_row_visible(organization_id) and public.is_org_admin(organization_id))
  with check (public.tenant_row_visible(organization_id) and public.is_org_admin(organization_id));

grant select, insert, update, delete on table public.organization_settings to authenticated;
grant all on table public.organization_settings to service_role;

commit;
