-- HT-47: Company > Documents.
--
-- The Company page gains a Documents section: rows such as "General liability
-- insurance", "Contractor licence" or "EMR", each with free-text details and
-- an optional attached file, that estimates and invoices can later pull in.
-- Documents live on public.company_attachments beside the logo, which is
-- already how the app keeps a file for the company (base64 in file_data; no
-- Storage bucket anywhere in the app):
--
--   is_logo = true    the logo, unchanged; every reader keeps filtering on it
--                     (invoices.tsx, InvoiceForm.tsx), so document rows never
--                     surface as the logo.
--   is_logo = false   a document. `label` is the name the admin gave it,
--                     `value` its details (policy number, licence number, a
--                     rate), and name / file_type / file_size / file_data the
--                     optional attachment. A document may have no file.
--
-- Also fixes a type bug from the 2025 schema: uploaded_by and updated_by were
-- created as timestamptz but identify the user who added / last changed the
-- row. They become uuid references to auth.users. A timestamp cannot be turned
-- into a user id and the app never wrote either column (the logo path inserts
-- without them), so any value they hold is meaningless and the columns are
-- dropped and recreated. The do block reads information_schema first, so the
-- file can be re-run.
--
-- Access: HT-55 (20260917140000_tenant_scoped_rls.sql) gave this table its
-- single `tenant_scoped` policy -- FOR ALL TO authenticated, USING and WITH
-- CHECK public.tenant_row_visible(organization_id) -- and re-bound the
-- auto_set_organization_id trigger to it. Both act on the row, not on
-- particular columns, so the new columns are covered as they are and nothing
-- here touches policies, grants or triggers. Writes stay open to every active
-- member of the organisation, as they are for the logo; the page itself is
-- admin-only (useRequireAdmin).
--
-- Apply by hand on the Coolify host before merging (see memory: applying
-- migrations on the host).

begin;

-- 1. The two document columns. The logo row leaves both null.
alter table public.company_attachments add column if not exists label text;
alter table public.company_attachments add column if not exists value text;

comment on column public.company_attachments.label is
  'HT-47: the name of a company document as entered on Company > Documents; null on the logo row.';
comment on column public.company_attachments.value is
  'HT-47: free-text details of a company document (policy number, licence number, rate); null on the logo row.';

-- 2. A row is a document unless it says it is the logo. Readers filter on
--    is_logo = true, so a null here would already not count as the logo; the
--    default just keeps new rows unambiguous.
alter table public.company_attachments alter column is_logo set default false;

-- 3. uploaded_by / updated_by: timestamptz -> uuid references auth.users.
do $$
declare
  col text;
begin
  foreach col in array array['uploaded_by', 'updated_by'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'company_attachments'
        and column_name = col
        and data_type <> 'uuid'
    ) then
      execute format('alter table public.company_attachments drop column %I', col);
      raise notice 'company_attachments.%: dropped the timestamptz column', col;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'company_attachments'
        and column_name = col
    ) then
      execute format(
        'alter table public.company_attachments add column %I uuid references auth.users (id) on delete set null',
        col);
      raise notice 'company_attachments.%: added as uuid references auth.users', col;
    end if;
  end loop;
end
$$;

comment on column public.company_attachments.uploaded_by is
  'The user who added the row. HT-47 changed it from timestamptz to a uuid reference.';
comment on column public.company_attachments.updated_by is
  'The user who last changed the row. HT-47 changed it from timestamptz to a uuid reference.';

-- 4. The Documents section lists by company; the logo lookup filters on is_logo.
create index if not exists idx_company_attachments_company_id_is_logo
  on public.company_attachments (company_id, is_logo);

-- 5. Verify: both columns are uuid, both new columns exist, and the HT-55
--    policy is still the only one on the table.
do $$
declare
  bad int;
  policies int;
begin
  select count(*) into bad
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'company_attachments'
    and column_name in ('uploaded_by', 'updated_by')
    and data_type <> 'uuid';
  if bad > 0 then
    raise exception 'Aborting: uploaded_by / updated_by are not uuid after the change';
  end if;

  select count(*) into bad
  from (values ('label'), ('value'), ('uploaded_by'), ('updated_by')) as expected (column_name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'company_attachments'
      and c.column_name = expected.column_name
  );
  if bad > 0 then
    raise exception 'Aborting: % expected column(s) missing on company_attachments', bad;
  end if;

  select count(*) into policies
  from pg_policies
  where schemaname = 'public' and tablename = 'company_attachments';
  if policies <> 1 then
    raise warning 'company_attachments has % policies; HT-55 expects exactly one (tenant_scoped)', policies;
  end if;
end
$$;

commit;

-- ===========================================================================
-- POST-DEPLOY CHECK
-- ===========================================================================
--   select column_name, data_type from information_schema.columns
--     where table_name = 'company_attachments'
--       and column_name in ('label', 'value', 'uploaded_by', 'updated_by');
--                                     -- label text, value text, both *_by uuid
--   select policyname from pg_policies where tablename = 'company_attachments';
--                                     -- tenant_scoped only
-- Then in the app, Admin > Company > Documents: add a row, attach a file,
-- save, reload; the logo on an invoice preview is unchanged.
