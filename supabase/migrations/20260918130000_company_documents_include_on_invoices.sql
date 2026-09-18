-- HT-78: let an admin mark which Company > Documents rows (HT-47,
-- 20260918110000_company_documents.sql) appear on invoices and estimates.
--
-- This is the first, M-sized slice from the ticket: a company-wide default
-- and the rendered "Licences & Insurance" block on screen, print/PDF and the
-- approval email. A per-invoice override (a sibling `included_documents`
-- jsonb column on public.invoices) and server-side email attachments are a
-- separate follow-up slice, so the invoice table is untouched here.
--
-- Expand-only: a new column with a safe default; no existing row changes
-- shape or loses data. The logo row (is_logo = true) is unaffected -- it is
-- never a candidate for the documents block, whatever this column holds on
-- it.
--
-- Apply by hand on the Coolify host before merging (see memory: applying
-- migrations on the host).

begin;

alter table public.company_attachments
  add column if not exists include_on_invoices boolean not null default false;

comment on column public.company_attachments.include_on_invoices is
  'HT-78: when true (and is_logo = false), this document''s name and details render in the "Licences & Insurance" block on invoices, estimates and the approval email.';

-- Verify: the column exists with the right type and default.
do $$
declare
  bad int;
begin
  select count(*) into bad
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'company_attachments'
    and column_name = 'include_on_invoices'
    and data_type = 'boolean'
    and column_default = 'false';
  if bad <> 1 then
    raise exception 'Aborting: company_attachments.include_on_invoices missing or has the wrong type/default';
  end if;
end
$$;

commit;

-- ===========================================================================
-- POST-DEPLOY CHECK
-- ===========================================================================
--   select column_name, data_type, column_default from information_schema.columns
--     where table_name = 'company_attachments' and column_name = 'include_on_invoices';
--                                     -- boolean, default false
-- Then in the app: Admin > Company > Documents, check "On invoices" on a
-- document and save; open an estimate's Print preview and confirm a
-- "Licences & Insurance" block appears with that document's name and
-- details, and that an unchecked document does not appear.
