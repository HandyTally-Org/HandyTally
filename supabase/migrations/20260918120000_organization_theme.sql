-- HT-68: the organisation's colour theme, chosen once on Admin > Settings >
-- Appearance and applied for every member.
--
-- A text column rather than a fourth jsonb document on the HT-50 row: it is
-- one value with two allowed states, and the check constraint is the whole
-- validation. 'light' is the default so every existing organisation keeps
-- its current look, and the app reads a missing or unknown value as light
-- too (web/constants/organizationSettings.ts). Access is unchanged: the
-- tenant_scoped read policy and admin_writes from
-- 20260917170000_organization_settings.sql cover the new column, so any
-- active member reads it and only admins and superusers change it.

begin;

alter table public.organization_settings
  add column if not exists theme text not null default 'light';

alter table public.organization_settings
  drop constraint if exists organization_settings_theme_check;
alter table public.organization_settings
  add constraint organization_settings_theme_check check (theme in ('light', 'dark'));

comment on column public.organization_settings.theme is
  'HT-68: colour theme for every member of the organisation: light (default) or dark.';

commit;
