-- HT-25: the columns the QuickBooks Online export needs, and the
-- organisation-level export settings. Expand-only (Docs/release-process.md
-- §6.1): every change is a nullable column, a column with a default, or a
-- jsonb document with a default, so a host still pinned to v1.5.0 keeps
-- working after this is applied. Nothing here contracts; the two contract
-- items are recorded at the bottom for a later release.
--
-- clients.postal_code (text) replaces clients.zip (numeric), which cannot
-- hold a leading zero ("02134" became 2134) or ZIP+4. Both columns stay for
-- the compatibility window: the v2 bundle reads and writes postal_code, the
-- v1.5.0 bundle keeps writing zip, and a trigger keeps the two in step in
-- both directions so an edit made on either bundle is seen by the other.
-- Dropping zip is a CONTRACT change: only once every host's footer shows a
-- tag that no longer reads it (release-process.md §6.2).
--
-- The unique index on invoices (organization_id, invoice_number) that the
-- ticket first proposed is NOT added: a constraint is contracting in effect
-- (an older bundle writing a duplicate number would start failing with no
-- explanation). The export blocks on duplicates instead.

begin;

-- ---------------------------------------------------------------------------
-- clients: company, mobile, website (QBO customer columns), postal_code
-- ---------------------------------------------------------------------------
alter table public.clients add column if not exists company text;
alter table public.clients add column if not exists mobile text;
alter table public.clients add column if not exists website text;
alter table public.clients add column if not exists postal_code text;

comment on column public.clients.company is 'HT-25: company name for the QuickBooks Customers export (QBO "Company").';
comment on column public.clients.mobile is 'HT-25: mobile number, masked like phone (QBO "Mobile").';
comment on column public.clients.website is 'HT-25: website (QBO "Website").';
comment on column public.clients.postal_code is
  'HT-25: ZIP / postal code as text so leading zeros and ZIP+4 survive. Kept in step with the numeric zip column by clients_sync_postal_code() until zip is dropped in a later release.';

-- Backfill from zip. A numeric zip of 2134 in a US organisation is "02134":
-- pad to five digits. Values longer than five digits are written as-is.
update public.clients
   set postal_code = case
         when zip is null then null
         when length(trunc(zip)::text) < 5 then lpad(trunc(zip)::text, 5, '0')
         else trunc(zip)::text
       end
 where postal_code is null
   and zip is not null;

-- Two-way sync for the compatibility window. Fires before insert or update
-- on clients; whichever of the two columns changed on this write wins.
--   * v2 bundle writes postal_code  -> zip follows (digits only, or null).
--   * v1.5.0 bundle writes zip      -> postal_code follows (padded to 5).
--   * both unchanged                -> no-op.
-- search_path is pinned (lesson from audit_trigger(), HT-65) so the function
-- behaves the same from GoTrue, PostgREST and psql sessions.
create or replace function public.clients_sync_postal_code()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  postal_changed boolean;
  zip_changed boolean;
  digits text;
begin
  if tg_op = 'INSERT' then
    postal_changed := new.postal_code is not null;
    zip_changed := new.zip is not null;
  else
    postal_changed := new.postal_code is distinct from old.postal_code;
    zip_changed := new.zip is distinct from old.zip;
  end if;

  if postal_changed then
    -- postal_code is the source of truth when it changed (or when both did).
    digits := nullif(regexp_replace(coalesce(new.postal_code, ''), '\D', '', 'g'), '');
    if digits is null then
      new.zip := null;
    else
      -- ZIP+4 "02134-1234" -> zip 2134 (the five-digit part), matching what
      -- the old bundle would have stored for that client.
      new.zip := left(digits, 5)::numeric;
    end if;
  elsif zip_changed then
    new.postal_code := case
      when new.zip is null then null
      when length(trunc(new.zip)::text) < 5 then lpad(trunc(new.zip)::text, 5, '0')
      else trunc(new.zip)::text
    end;
  end if;

  return new;
end;
$$;

comment on function public.clients_sync_postal_code() is
  'HT-25 compatibility shim: keeps clients.zip (numeric, read by bundles <= v1.5.0) and clients.postal_code (text, v2+) in step in both directions. Drop with clients.zip once no running host reads zip.';

drop trigger if exists clients_sync_postal_code on public.clients;
create trigger clients_sync_postal_code
  before insert or update of zip, postal_code on public.clients
  for each row execute function public.clients_sync_postal_code();

-- ---------------------------------------------------------------------------
-- invoices.terms: payment terms, driving due_date in the form and the QBO
-- "Terms" column. Null on old rows; the export derives terms from the date
-- delta as a fallback.
-- ---------------------------------------------------------------------------
alter table public.invoices add column if not exists terms text;
comment on column public.invoices.terms is
  'HT-25: payment terms: due_on_receipt, net_15, net_30, net_60. Null = not set (older rows); derived from due_date - issue_date when exporting.';

-- ---------------------------------------------------------------------------
-- invoice_items.taxable: per-line taxable flag (QBO "Taxable"). Defaults to
-- true so every existing line and every line written by an older bundle
-- keeps today's all-lines-taxed behaviour.
-- ---------------------------------------------------------------------------
alter table public.invoice_items add column if not exists taxable boolean not null default true;
comment on column public.invoice_items.taxable is
  'HT-25: whether the invoice tax rate applies to this line. Default true keeps the pre-v2 behaviour for rows that never set it.';

-- ---------------------------------------------------------------------------
-- organization_settings.export: the Admin > Export options
--   { "country": "United States", "terms": "net_30", "date_format": "MM/DD/YYYY" }
-- Read like the other jsonb documents on the row (nav, labels,
-- custom_fields); the app supplies the defaults for missing keys.
-- ---------------------------------------------------------------------------
alter table public.organization_settings add column if not exists export jsonb not null default '{}'::jsonb;
comment on column public.organization_settings.export is
  'HT-25: Admin > Export settings (country, default payment terms, date format, later QBO account names). Missing keys take the app defaults.';

commit;

-- Verification (read-only)
do $$
declare
  n_mismatch int;
begin
  select count(*) into n_mismatch
    from public.clients
   where zip is not null
     and postal_code is distinct from (case when length(trunc(zip)::text) < 5 then lpad(trunc(zip)::text, 5, '0') else trunc(zip)::text end);
  if n_mismatch > 0 then
    raise exception 'HT-25: % clients have zip and postal_code out of step after backfill', n_mismatch;
  end if;
  raise notice 'HT-25: clients.postal_code backfilled and in step with zip';
end $$;

-- Contract-window items (NOT in this release; see CHANGELOG):
--   * drop column public.clients.zip and the clients_sync_postal_code trigger
--     once every host runs a tag >= v2.0.0.
--   * unique index on public.invoices (organization_id, invoice_number)
--     where invoice_number is not null, once every host runs a bundle that
--     prevents duplicates at the source and the data has been audited.
