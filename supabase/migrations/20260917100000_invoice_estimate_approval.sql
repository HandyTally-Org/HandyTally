-- HT-10: estimate -> work order approval workflow.
--
-- Every new invoice starts as an estimate. The contractor emails it with
-- "Send for Approval"; the email carries a link that anyone holding it can
-- use to approve, which moves the estimate to a work order. Three columns
-- support that:
--
--   created_by      who made the estimate. The approval email is also sent to
--                   this user, and they are notified when the client approves.
--                   Same pattern as jobs.created_by (HT-1): defaults to
--                   auth.uid() so every insert path stamps it without changes.
--                   invoices.user_id is not usable for this: the app writes 0
--                   or a hash of the auth UUID into it.
--   approval_token  the secret in the approval link. Generated per invoice,
--                   never shown in the app, checked by the approve-estimate
--                   edge function with the service role.
--   approved_at     when the client approved. Null until then. The status
--                   change to work_order happens at the same moment; this is
--                   the audit trail for it.
--
-- 'draft' stops being a reachable status: the app rewrote draft rows to
-- estimate on every page load (updateDraftToEstimate), which this migration
-- replaces with a one-off backfill.

alter table "public"."invoices"
  add column if not exists "created_by" uuid default auth.uid(),
  add column if not exists "approval_token" uuid not null default gen_random_uuid(),
  add column if not exists "approved_at" timestamp with time zone;

alter table "public"."invoices"
  drop constraint if exists "invoices_created_by_fkey",
  add constraint "invoices_created_by_fkey"
    foreign key ("created_by") references auth.users("id")
    on delete set null;

create unique index if not exists "invoices_approval_token_key"
  on "public"."invoices" ("approval_token");

update "public"."invoices"
  set "status" = 'estimate'
  where "status" = 'draft';

comment on column "public"."invoices"."created_by" is
  'User who created the estimate. Receives a copy of the approval email and the approval notification.';
comment on column "public"."invoices"."approval_token" is
  'Secret carried by the approval link. Anyone holding it can approve the estimate; checked by approve-estimate.';
comment on column "public"."invoices"."approved_at" is
  'When the client approved the estimate (status moved to work_order). Null until approved.';
