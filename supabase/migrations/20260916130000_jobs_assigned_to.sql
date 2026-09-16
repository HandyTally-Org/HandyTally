-- HT-35: who a job is assigned to.
--
-- The office picks one person from the organisation's members in a new
-- "Assigned to" dropdown on the job form. One user per job; HT-9 (technician
-- app) may widen this to several people later, in which case the rows here
-- seed its join table.
--
-- Same shape as jobs.created_by (20260915130000): a uuid into auth.users, set
-- to NULL if the account is deleted. No default: a new job is unassigned until
-- someone is picked. Nothing in the database checks that the assignee belongs
-- to the job's organisation, because jobs.organization_id is still NULL on
-- every row (DI-02); the app only offers the caller's own organisation's
-- members. No policy change: whoever may edit a job may assign it.
--
-- The index is for the list sort today and HT-9's "my jobs" query tomorrow.

alter table "public"."jobs"
  add column if not exists "assigned_to" uuid;

alter table "public"."jobs"
  drop constraint if exists "jobs_assigned_to_fkey",
  add constraint "jobs_assigned_to_fkey"
    foreign key ("assigned_to") references auth.users("id")
    on delete set null;

create index if not exists "jobs_assigned_to_idx"
  on "public"."jobs" ("assigned_to");

comment on column "public"."jobs"."assigned_to" is
  'User the job is assigned to ("Assigned to" in the app). NULL = unassigned.';
