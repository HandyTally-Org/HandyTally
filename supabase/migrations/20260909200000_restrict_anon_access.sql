-- Close anonymous (anon) access to application tables.
--
-- PROBLEM
-- -------
-- Thirty-nine policies created in 20250723032713_remote_schema.sql were
-- granted to the PUBLIC role with a literal `true` condition, and were never
-- dropped when the organization-scoped policies arrived in
-- 20250808010055_remote_schema.sql. PostgreSQL combines permissive policies
-- with OR, so the loose policies always win and the org-scoped ones add
-- nothing.
--
-- PUBLIC includes `anon`. The anon key is embedded in the app's static
-- JavaScript bundle, so it is public by construction: anyone who loads
-- HandyTally in a browser can read it out.
--
-- Verified against the live database on 2026-09-09:
--     SET ROLE anon; SELECT count(*) FROM public.jobs;   -- returned all rows
-- Row-level security is enabled on every table, so this was the policies
-- letting anonymous callers through, not a missing switch. UPDATE and DELETE
-- were open on the same terms, so an anonymous caller could also modify and
-- destroy data across every organization.
--
-- The policy names are misleading and should not be trusted while reviewing
-- this: nearly all read "Allow select for authenticated users" while actually
-- being granted to PUBLIC.
--
--
-- WHY THIS MIGRATION DOES NOT SIMPLY DROP THEM
-- --------------------------------------------
-- Dropping the loose policies and letting the organization-scoped policies
-- take over is the correct end state. Applied against the database as it
-- stands today it would hide every row from every user.
--
-- Two things measured on the live database on 2026-09-09:
--
--   1. Every existing row has a NULL organization_id.
--          jobs 3 of 3, clients 2 of 2, invoices 1 of 1, invoice_items 1 of 1
--      The org-scoped policies match on `om.organization_id = t.organization_id`,
--      and NULL never equals anything, so all of it would disappear.
--
--   2. Exactly one organization_membership row exists, in the test
--      organization `acme-13`. Every other user belongs to no organization at
--      all, so even correctly stamped rows would be invisible to them.
--
-- The web app also never reads organization_id or membership anywhere; it
-- relies entirely on these loose policies to see data. Removing them without
-- first making the app organization-aware is a full lockout, not a fix.
--
--
-- WHAT THIS MIGRATION DOES INSTEAD
-- --------------------------------
-- Re-points the existing policies from PUBLIC to `authenticated`, leaving
-- their conditions untouched. That kills anonymous access completely, which is
-- the critical half of the problem, and changes nothing for a logged-in user.
--
-- ALTER POLICY is used rather than drop-and-recreate so the existing USING and
-- WITH CHECK expressions are preserved exactly. Policies are selected by role
-- rather than by name, because several names are unreliable: two on
-- email_integrations have leading spaces, and an INSERT policy on
-- jobs_attachments is named "Allow select for authenticated users".
--
-- The cross-organization half of the problem is NOT fixed here. See the
-- follow-up section at the bottom. It is deliberately deferred because it is
-- a data and application change, not a policy change.

begin;

-- ---------------------------------------------------------------------------
-- 1. Re-point every PUBLIC-role policy on app tables to `authenticated`
-- ---------------------------------------------------------------------------
do $$
declare
    r       record;
    changed int := 0;
begin
    for r in
        select schemaname, tablename, policyname
        from pg_policies
        where schemaname = 'public'
          and tablename in (
                'clients', 'company', 'company_attachments',
                'email_integrations', 'invoice_items', 'invoices',
                'job_calendar_events', 'job_costs', 'jobs',
                'jobs_attachments', 'materials', 'profiles', 'services'
              )
          and 'public' = any (roles)
    loop
        execute format('alter policy %I on %I.%I to authenticated',
                       r.policyname, r.schemaname, r.tablename);
        changed := changed + 1;
    end loop;

    raise notice 'Re-pointed % policies from PUBLIC to authenticated', changed;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Verify no anonymous route remains before committing
-- ---------------------------------------------------------------------------
do $$
declare
    leftover int;
begin
    select count(*)
      into leftover
    from pg_policies
    where schemaname = 'public'
      and tablename in (
            'clients', 'company', 'company_attachments',
            'email_integrations', 'invoice_items', 'invoices',
            'job_calendar_events', 'job_costs', 'jobs',
            'jobs_attachments', 'materials', 'profiles', 'services'
          )
      and 'public' = any (roles);

    if leftover > 0 then
        raise exception
            'Aborting: % PUBLIC-role policies still present on app tables',
            leftover;
    end if;
end
$$;

commit;


-- ===========================================================================
-- POST-DEPLOY CHECK
-- ===========================================================================
-- Should return 0. Before this migration it returned every job.
--     SET ROLE anon;
--     SELECT count(*) FROM public.jobs;
--     RESET ROLE;
--
-- Then sign in to the app as a normal user and confirm nothing has changed:
-- clients, jobs, invoices, labor, inventory, schedule, dashboard and
-- admin/users should all behave exactly as before. This migration does not
-- narrow what a logged-in user can see, so any list that goes empty means
-- something else is wrong.


-- ===========================================================================
-- REQUIRED FOLLOW-UP, NOT DONE HERE
-- ===========================================================================
-- 1. CROSS-ORGANIZATION ISOLATION IS STILL OPEN.
--    Any logged-in user can still read and write every organization's data.
--    Closing it needs, in order:
--      a. Backfill organization_id on all existing rows. Someone has to decide
--         which organization the current data belongs to; there are seven, and
--         six look like test tenants (acme-13, acme-14, acme-15, Acme Demo,
--         demo, demo-now) alongside `wgelectric`.
--      b. Give every real user an organization_memberships row. Only one
--         exists today.
--      c. Make the web app organization-aware. It currently never reads
--         organization_id, membership or role. This is HT-12.
--      d. Only then drop the wide `authenticated` policies this migration
--         preserved, leaving the org-scoped ones as the sole policies.
--    Doing (d) before (a) to (c) empties the app.
--
-- 2. FIVE auto_set_organization_id TRIGGERS ARE BOUND TO THE WRONG TABLE.
--    Confirmed on the live database:
--      auto_set_org_id_invoice_items        is on invoices  (should be invoice_items)
--      auto_set_org_id_job_calendar_events  is on jobs      (should be job_calendar_events)
--      auto_set_org_id_jobs_costs           is on materials (should be job_costs)
--      auto_set_org_id_jobs_attachments     is on services  (should be jobs_attachments)
--      auto_set_org_id_company_attachments  is on company   (should be company_attachments)
--    So invoice_items, job_calendar_events, job_costs, jobs_attachments and
--    company_attachments have no working organization stamping at all. This
--    must be fixed before step 1(d), or those tables will be permanently
--    invisible once the loose policies are removed.
--
-- 3. profiles.password STORES A CREDENTIAL IN A PLAIN VARCHAR COLUMN.
--    Supabase Auth already holds credentials in auth.users, so the column is
--    redundant and should be dropped rather than secured. profiles also
--    duplicates user_profiles; reconciling them is part of HT-12.
--
-- 4. email_integrations NEEDS REAL POLICIES BEFORE HT-11 WRITES TO IT.
--    It is empty today. It is designed to hold OAuth access and refresh
--    tokens, and a leaked refresh token is a user's entire mailbox. It needs
--    owner-scoped policies and encryption at rest. Note also that
--    email_integrations.user_id is bigint while auth.uid() returns uuid, so an
--    owner check cannot currently be expressed against the schema.
