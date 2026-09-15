-- HT-1: per-user calendar connections (the "connected accounts" foundation).
--
-- WHY
-- ---
-- upsert-calendar-event pushes every job to ONE calendar, identified by the
-- NYLAS_GRANT_ID / NYLAS_CALENDAR_ID function secrets. Nobody can connect
-- their own Google Calendar, and every job lands on the same fixed calendar
-- regardless of who created it.
--
-- The plumbing that fixes this -- a Nylas grant stored per user -- is the same
-- plumbing HT-11 (send and read email as the user) needs, so it is built once
-- here and HT-11 reuses it.
--
-- WHERE THE GRANT LIVES
-- ---------------------
-- email_integrations was created in 20250723032713_remote_schema.sql for
-- exactly this purpose (its grant_id column is Nylas terminology) and then
-- never used: no code references it and, checked on the live database, it has
-- no rows. It is reshaped here rather than replaced so the two tickets keep
-- referring to the same table.
--
--   * user_id becomes uuid -> auth.users. It was bigint, which cannot hold a
--     Supabase user id; the migration aborts if any row exists, because a
--     bigint user_id could not be mapped to a user anyway.
--   * access_token / refresh_token are dropped. With Nylas v3 hosted auth the
--     provider tokens never reach us: the grant_id, used together with the
--     server-side NYLAS_API_KEY, is the whole credential. Not storing what we
--     do not need also closes the "a leaked refresh token is someone's entire
--     mailbox" concern raised in HT-11 before anything writes to the table.
--   * calendar_id records the calendar chosen at connect time (the primary
--     one), status lets the webhook mark a grant Nylas has rejected so the UI
--     can offer "Reconnect", and organization_id is added for the tenancy
--     work (DI-02) so this table does not need reshaping again.
--
-- ROW-LEVEL SECURITY
-- ------------------
-- The four policies from the 2025 snapshot were `USING (true)` for everyone,
-- so any signed-in user could read or rewrite anyone else's grant. They are
-- dropped. A user may only SELECT their own row; every write goes through the
-- calendar-connect edge function with the service role, which bypasses RLS.
-- There are deliberately no INSERT / UPDATE / DELETE policies.
--
-- WHOSE CALENDAR A JOB GOES TO
-- ----------------------------
-- jobs had no owner column. jobs.created_by is added, defaulting to auth.uid()
-- so the existing insert paths in the web app stamp it without changes.
-- upsert-calendar-event uses it to pick the grant. Existing rows stay NULL and
-- keep going to the shared calendar while NYLAS_GRANT_ID is still configured.

begin;

-- ---------------------------------------------------------------------------
-- 1. email_integrations: reshape for per-user Nylas grants
-- ---------------------------------------------------------------------------
do $$
begin
    if exists (select 1 from public.email_integrations) then
        raise exception
            'email_integrations has rows with a bigint user_id that cannot be mapped to auth.users; clear it before applying HT-1';
    end if;
end
$$;

-- Old wide-open policies (note the leading spaces in two of the names).
drop policy if exists "  Allow insert for authenticated users"        on public.email_integrations;
drop policy if exists "  Allow update for authenticated users"        on public.email_integrations;
drop policy if exists "Allow authenticated users to select clients"   on public.email_integrations;
drop policy if exists "Allow delete for authenticated users"          on public.email_integrations;

alter table public.email_integrations
    drop column if exists access_token,
    drop column if exists refresh_token;

-- bigint -> uuid. The table is empty (checked above), so the USING clause only
-- has to type-check.
alter table public.email_integrations
    alter column user_id type uuid using null::uuid;

alter table public.email_integrations
    add column if not exists calendar_id      text,
    add column if not exists status           text not null default 'active',
    add column if not exists organization_id  uuid;

alter table public.email_integrations
    alter column grant_id   set not null,
    alter column provider   set not null,
    alter column created_at set default now(),
    alter column created_at set not null,
    alter column updated_at set default now(),
    alter column updated_at set not null;

alter table public.email_integrations
    drop constraint if exists email_integrations_user_id_fkey,
    add constraint email_integrations_user_id_fkey
        foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.email_integrations
    drop constraint if exists email_integrations_organization_id_fkey,
    add constraint email_integrations_organization_id_fkey
        foreign key (organization_id) references public.organizations(id) on delete set null;

alter table public.email_integrations
    drop constraint if exists email_integrations_status_check,
    add constraint email_integrations_status_check
        check (status in ('active', 'revoked'));

-- One connected account per user for now. HT-11 may relax this to
-- (user_id, provider) if a user needs a mailbox and a calendar on different
-- accounts.
create unique index if not exists email_integrations_user_id_key
    on public.email_integrations (user_id);

comment on table public.email_integrations is
    'Per-user Nylas grants. grant_id + the server-side NYLAS_API_KEY is the credential; provider tokens are never stored. Written only by the calendar-connect edge function.';
comment on column public.email_integrations.status is
    'active, or revoked once Nylas rejects the grant (user removed access, or the grant expired); the UI then offers Reconnect.';

alter table public.email_integrations enable row level security;

drop policy if exists "Users can read their own connected account" on public.email_integrations;
create policy "Users can read their own connected account"
    on public.email_integrations
    for select
    to authenticated
    using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. jobs.created_by: which user's calendar a job is pushed to
-- ---------------------------------------------------------------------------
alter table public.jobs
    add column if not exists created_by uuid default auth.uid();

alter table public.jobs
    drop constraint if exists jobs_created_by_fkey,
    add constraint jobs_created_by_fkey
        foreign key (created_by) references auth.users(id) on delete set null;

comment on column public.jobs.created_by is
    'User who created the job. upsert-calendar-event pushes the job to this user''s connected calendar (email_integrations).';

commit;
