-- HT-4: record when an invoice or estimate was emailed to the client.
--
-- The status column carries both document type (estimate, work_order) and
-- payment state (sent, partial_paid, paid, overdue), so it cannot also record
-- whether a document has gone out without destroying one of those meanings --
-- marking an estimate as "sent" would stop it being an estimate.
--
-- sent_at is therefore the source of truth for "has this been emailed", and is
-- independent of status. A null value means it has never been sent.

alter table "public"."invoices"
  add column if not exists "sent_at" timestamp with time zone;

comment on column "public"."invoices"."sent_at" is
  'When this document was last emailed to the client. Null means never sent. Independent of status.';
