-- HT-54: a material on an approved invoice comes out of inventory.
--
-- An estimate and the invoice it becomes are the same row: invoices.status
-- runs estimate -> work_order -> sent / partial_paid / paid / overdue /
-- cancelled, and the invoice_items rows are shared by every stage. Stock is
-- therefore not touched while a document is only an estimate; it moves when
-- the document becomes a work order (client approval through approve-estimate,
-- or a manual status change), and moves back if the document is cancelled or
-- reverted to an estimate.
--
-- Every write path - the invoice form, the Excel importer, the legacy
-- screens, the approve-estimate function - goes straight to the tables, so
-- the rule lives here, in triggers, and not in app code.
--
-- Bookkeeping: invoices.stock_deducted_at says whether this invoice's
-- materials are currently out of stock. Every trigger asks that column
-- instead of re-deriving the answer from status history, which is what makes
-- a double deduction impossible rather than merely unlikely.
--
--   invoices, before insert/update (trigger A/B)
--     status moves from outside the deducting set into it (estimate ->
--     work_order, a cancelled work order reopened, a row inserted as a work
--     order) and stock_deducted_at is null
--       -> subtract the invoice's material totals, stamp stock_deducted_at
--     status leaves the deducting set and stock_deducted_at is set
--       -> add the totals back, clear stock_deducted_at
--     A move within the set (work_order -> sent -> paid) changes nothing, so
--     the work orders and invoices that exist before this migration, which
--     never deducted, never will - and cancelling or deleting one of them
--     gives nothing back either, because they are not stamped.
--   invoice_items, after insert/update/delete, per statement (trigger C)
--     for every parent invoice with stock_deducted_at set, apply the net
--     change per material across the whole statement. The app saves an
--     edit by deleting every line and inserting the new set; the delete
--     statement restores the old totals and the insert statement deducts
--     the new ones, so an edit to an unrelated field nets to zero.
--   invoices, before delete (trigger D)
--     a deducted invoice gives its stock back before it goes. The app
--     deletes the lines first (trigger C restores them then), so this only
--     matters if a line ever goes with its invoice in one statement.
--
-- Negative stock is allowed (decided 2026-09-17): a quantity below zero is
-- the signal the procurements report will read. There is no sufficiency
-- check here and there must be no CHECK (quantity >= 0) later.
--
-- Only invoice_items with type = 'material' and a material_id move stock;
-- services never do. job_costs also consume materials through jobs and are
-- deliberately left alone - deducting there too would double-count a job
-- whose costs are later invoiced.
--
-- The functions are SECURITY DEFINER so a member's status change can adjust
-- a materials row under tenant-scoped RLS (HT-55) whatever host or client
-- the request came from; in exchange every update is pinned to the invoice's
-- own organization_id.

begin;

alter table public.invoices
  add column if not exists stock_deducted_at timestamp with time zone;

comment on column public.invoices.stock_deducted_at is
  'HT-54: set while this invoice''s material lines are subtracted from materials.quantity; null while it is an estimate or cancelled.';

-- Statuses in which an invoice holds its materials out of stock.
create or replace function public.invoice_status_deducts_stock(p_status text)
 returns boolean
 language sql
 immutable
as $function$
  select p_status in ('work_order', 'sent', 'partial_paid', 'paid', 'overdue');
$function$;

-- Move p_delta units of one material, within one organisation. A positive
-- delta puts stock back; a negative one takes it out.
create or replace function public.adjust_material_stock(p_organization_id uuid, p_material_id bigint, p_delta numeric)
 returns void
 language sql
 security definer
 set search_path = public, pg_temp
as $function$
  update public.materials m
     set quantity = coalesce(m.quantity, 0) + p_delta
   where m.uid = p_material_id
     and m.organization_id is not distinct from p_organization_id
     and p_delta <> 0;
$function$;

-- Every material on an invoice with its total quantity across the lines.
create or replace function public.invoice_material_totals(p_invoice_id bigint)
 returns table (material_id bigint, quantity numeric)
 language sql
 stable
 security definer
 set search_path = public, pg_temp
as $function$
  select ii.material_id, sum(coalesce(ii.quantity, 0))
    from public.invoice_items ii
   where ii.invoice_id = p_invoice_id
     and ii.type = 'material'
     and ii.material_id is not null
   group by ii.material_id;
$function$;

-- Trigger A/B: the invoice's status decides whether its materials are out.
create or replace function public.invoice_stock_on_status()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  deducting boolean := public.invoice_status_deducts_stock(new.status);
  was_deducting boolean := tg_op = 'UPDATE' and public.invoice_status_deducts_stock(old.status);
  r record;
begin
  -- The column belongs to this trigger. The app saves whole rows, and a row
  -- fetched before an approval would otherwise write the stamp back to null
  -- without putting the stock back.
  if tg_op = 'UPDATE' then
    new.stock_deducted_at := old.stock_deducted_at;
  else
    new.stock_deducted_at := null;
  end if;

  if deducting and not was_deducting and new.stock_deducted_at is null then
    for r in select * from public.invoice_material_totals(new.uid) loop
      perform public.adjust_material_stock(new.organization_id, r.material_id, -r.quantity);
    end loop;
    new.stock_deducted_at := now();
  elsif not deducting and new.stock_deducted_at is not null then
    for r in select * from public.invoice_material_totals(new.uid) loop
      perform public.adjust_material_stock(new.organization_id, r.material_id, r.quantity);
    end loop;
    new.stock_deducted_at := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists invoice_stock_on_status on public.invoices;
create trigger invoice_stock_on_status
  before insert or update on public.invoices
  for each row execute function public.invoice_stock_on_status();

-- Trigger C: line changes on an invoice that is already out of stock. One
-- statement-level trigger per event so each can name its transition table;
-- the function reads only the table its event provides.
create or replace function public.invoice_items_stock_sync()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  -- Each branch reads only the transition table its trigger declares.
  if tg_op = 'INSERT' then
    update public.materials m
       set quantity = coalesce(m.quantity, 0) - t.q
      from (select invoice_id, material_id, sum(coalesce(quantity, 0)) as q
              from new_rows
             where type = 'material' and material_id is not null
             group by invoice_id, material_id) t
      join public.invoices i on i.uid = t.invoice_id
     where i.stock_deducted_at is not null
       and m.uid = t.material_id
       and m.organization_id is not distinct from i.organization_id
       and t.q <> 0;
  elsif tg_op = 'DELETE' then
    update public.materials m
       set quantity = coalesce(m.quantity, 0) + t.q
      from (select invoice_id, material_id, sum(coalesce(quantity, 0)) as q
              from old_rows
             where type = 'material' and material_id is not null
             group by invoice_id, material_id) t
      join public.invoices i on i.uid = t.invoice_id
     where i.stock_deducted_at is not null
       and m.uid = t.material_id
       and m.organization_id is not distinct from i.organization_id
       and t.q <> 0;
  else
    -- Net change per material per invoice across the whole statement.
    update public.materials m
       set quantity = coalesce(m.quantity, 0) - d.delta
      from (select coalesce(n.invoice_id, o.invoice_id) as invoice_id,
                   coalesce(n.material_id, o.material_id) as material_id,
                   coalesce(n.q, 0) - coalesce(o.q, 0) as delta
              from (select invoice_id, material_id, sum(coalesce(quantity, 0)) as q
                      from new_rows
                     where type = 'material' and material_id is not null
                     group by invoice_id, material_id) n
              full join (select invoice_id, material_id, sum(coalesce(quantity, 0)) as q
                           from old_rows
                          where type = 'material' and material_id is not null
                          group by invoice_id, material_id) o
                on o.invoice_id = n.invoice_id and o.material_id = n.material_id) d
      join public.invoices i on i.uid = d.invoice_id
     where i.stock_deducted_at is not null
       and m.uid = d.material_id
       and m.organization_id is not distinct from i.organization_id
       and d.delta <> 0;
  end if;
  return null;
end;
$function$;

drop trigger if exists invoice_items_stock_sync_insert on public.invoice_items;
create trigger invoice_items_stock_sync_insert
  after insert on public.invoice_items
  referencing new table as new_rows
  for each statement execute function public.invoice_items_stock_sync();

drop trigger if exists invoice_items_stock_sync_update on public.invoice_items;
create trigger invoice_items_stock_sync_update
  after update on public.invoice_items
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.invoice_items_stock_sync();

drop trigger if exists invoice_items_stock_sync_delete on public.invoice_items;
create trigger invoice_items_stock_sync_delete
  after delete on public.invoice_items
  referencing old table as old_rows
  for each statement execute function public.invoice_items_stock_sync();

-- Trigger D: a deducted invoice returns its stock before it is deleted.
create or replace function public.invoice_stock_on_delete()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  r record;
begin
  if old.stock_deducted_at is not null then
    for r in select * from public.invoice_material_totals(old.uid) loop
      perform public.adjust_material_stock(old.organization_id, r.material_id, r.quantity);
    end loop;
  end if;
  return old;
end;
$function$;

drop trigger if exists invoice_stock_on_delete on public.invoices;
create trigger invoice_stock_on_delete
  before delete on public.invoices
  for each row execute function public.invoice_stock_on_delete();

revoke all on function public.adjust_material_stock(uuid, bigint, numeric) from public;
revoke all on function public.invoice_material_totals(bigint) from public;
grant execute on function public.invoice_status_deducts_stock(text) to authenticated, service_role;
grant execute on function public.invoice_material_totals(bigint) to authenticated, service_role;

commit;
