-- HT-18: let a job be deleted when it has cost lines or attachments.
--
-- job_costs.job_id and jobs_attachments.job_id referenced jobs(uid) with no
-- ON DELETE action, so Postgres refused to delete any job that had either
-- (foreign_key_violation 23503) and the Jobs page reported a generic error.
--
-- Both tables hold rows that only exist as part of their job -- a cost line or
-- an uploaded file has no meaning once the job is gone -- so they follow the
-- job. invoices.job_id is left as-is (ON DELETE SET NULL): an invoice is a
-- financial document in its own right and must survive its job being removed.

alter table "public"."job_costs"
  drop constraint if exists "job_costs_job_id_fkey",
  add constraint "job_costs_job_id_fkey"
    foreign key ("job_id") references "public"."jobs"("uid")
    on update cascade on delete cascade;

alter table "public"."jobs_attachments"
  drop constraint if exists "jobs_attachments_job_id_fkey",
  add constraint "jobs_attachments_job_id_fkey"
    foreign key ("job_id") references "public"."jobs"("uid")
    on update cascade on delete cascade;
