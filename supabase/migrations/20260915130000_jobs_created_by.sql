-- HT-1: record who created a job so the calendar invite can go to them.
--
-- upsert-calendar-event creates each job's event on the shared HandyTally
-- calendar and invites the client. It had no way to know which HandyTally
-- user the job belongs to, so the user never received the invite on their
-- own Google Calendar.
--
-- created_by defaults to auth.uid(), so every existing insert path in the web
-- app stamps it without changes. Rows inserted by the service role (no
-- session) stay NULL and simply do not invite anyone extra. Existing rows are
-- NULL too; they are not backfilled because there is no record of who made
-- them.

alter table "public"."jobs"
  add column if not exists "created_by" uuid default auth.uid();

alter table "public"."jobs"
  drop constraint if exists "jobs_created_by_fkey",
  add constraint "jobs_created_by_fkey"
    foreign key ("created_by") references auth.users("id")
    on delete set null;

comment on column "public"."jobs"."created_by" is
  'User who created the job. upsert-calendar-event invites this user''s email to the job''s calendar event.';
