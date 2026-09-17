-- HT-54: walks every path that moves stock and asserts the material's
-- quantity after each one. Runs inside one transaction and rolls back, so
-- it leaves no rows behind and can be run on the live database:
--
--   git show origin/master:supabase/tests/ht54_stock_deduction.sql \
--     | ssh <host> 'docker exec -i supabase-db-<service> psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1'
--
-- Every check is an ASSERT: the script prints "HT-54: all checks passed" at
-- the end or stops at the first failing assertion with its message.

begin;

do $$
declare
  org uuid;
  other_org uuid;
  m1 bigint;
  m2 bigint;
  inv bigint;
  q1 numeric;
  q2 numeric;
  stamped timestamptz;
begin
  select id into org from public.organizations where subdomain = 'demo';
  assert org is not null, 'needs the demo organization';

  insert into public.materials (name, quantity, organization_id) values ('HT-54 test bolt', 10, org) returning uid into m1;
  insert into public.materials (name, quantity, organization_id) values ('HT-54 test wire', 5, org) returning uid into m2;

  -- 1. An estimate with two lines of m1 and one of m2 and a service: nothing moves.
  insert into public.invoices (invoice_number, status, organization_id) values ('HT54-1', 'estimate', org) returning uid into inv;
  insert into public.invoice_items (invoice_id, type, material_id, quantity, organization_id) values
    (inv, 'material', m1, 3, org),
    (inv, 'material', m1, 2, org),
    (inv, 'material', m2, 4, org),
    (inv, 'service', null, 9, org);
  select quantity into q1 from public.materials where uid = m1;
  select quantity into q2 from public.materials where uid = m2;
  assert q1 = 10 and q2 = 5, format('estimate must not move stock, got %s / %s', q1, q2);
  assert (select stock_deducted_at from public.invoices where uid = inv) is null, 'estimate must not be stamped';

  -- 2. Editing the estimate (delete + reinsert, as the app does): still nothing.
  delete from public.invoice_items where invoice_id = inv;
  insert into public.invoice_items (invoice_id, type, material_id, quantity, organization_id) values
    (inv, 'material', m1, 5, org),
    (inv, 'material', m2, 4, org);
  select quantity into q1 from public.materials where uid = m1;
  assert q1 = 10, format('editing an estimate must not move stock, got %s', q1);

  -- 3. Approval: estimate -> work_order deducts 5 of m1 and 4 of m2 and stamps.
  update public.invoices set status = 'work_order', approved_at = now() where uid = inv;
  select quantity into q1 from public.materials where uid = m1;
  select quantity into q2 from public.materials where uid = m2;
  assert q1 = 5 and q2 = 1, format('approval must deduct, got %s / %s', q1, q2);
  select stock_deducted_at into stamped from public.invoices where uid = inv;
  assert stamped is not null, 'approval must stamp stock_deducted_at';

  -- 4. Approving again (same statement the function would send) is a no-op.
  update public.invoices set status = 'work_order' where uid = inv and status = 'estimate';
  update public.invoices set status = 'work_order' where uid = inv;
  select quantity into q1 from public.materials where uid = m1;
  assert q1 = 5, format('a second approval must not deduct again, got %s', q1);

  -- 5. Saving the whole row with a stale null stamp must not clear it.
  update public.invoices set stock_deducted_at = null, invoice_number = 'HT54-1 edited' where uid = inv;
  assert (select stock_deducted_at from public.invoices where uid = inv) = stamped, 'the trigger owns stock_deducted_at';

  -- 6. Moving within the deducting set changes nothing.
  update public.invoices set status = 'sent' where uid = inv;
  select quantity into q1 from public.materials where uid = m1;
  assert q1 = 5, format('work_order -> sent must not move stock, got %s', q1);

  -- 7. Editing an unrelated field via delete + reinsert of identical lines nets to zero.
  delete from public.invoice_items where invoice_id = inv;
  select quantity into q1 from public.materials where uid = m1;
  assert q1 = 10, format('deleting the lines of a deducted invoice must restore, got %s', q1);
  insert into public.invoice_items (invoice_id, type, material_id, quantity, organization_id) values
    (inv, 'material', m1, 5, org),
    (inv, 'material', m2, 4, org);
  select quantity into q1 from public.materials where uid = m1;
  select quantity into q2 from public.materials where uid = m2;
  assert q1 = 5 and q2 = 1, format('reinserting the same lines must deduct again, got %s / %s', q1, q2);

  -- 8. Changing a line from 5 to 3 in place restores the net 2.
  update public.invoice_items set quantity = 3 where invoice_id = inv and material_id = m1;
  select quantity into q1 from public.materials where uid = m1;
  assert q1 = 7, format('5 -> 3 must restore 2, got %s', q1);

  -- 9. A material on two lines of the same invoice sums.
  insert into public.invoice_items (invoice_id, type, material_id, quantity, organization_id) values (inv, 'material', m1, 1, org);
  select quantity into q1 from public.materials where uid = m1;
  assert q1 = 6, format('a second line of the same material must deduct too, got %s', q1);

  -- 10. Negative stock is allowed.
  update public.invoice_items set quantity = 20 where invoice_id = inv and material_id = m2;
  select quantity into q2 from public.materials where uid = m2;
  assert q2 = -15, format('negative stock must be allowed, got %s', q2);

  -- 11. Cancelling restores everything and clears the stamp.
  update public.invoices set status = 'cancelled' where uid = inv;
  select quantity into q1 from public.materials where uid = m1;
  select quantity into q2 from public.materials where uid = m2;
  assert q1 = 10 and q2 = 5, format('cancel must restore, got %s / %s', q1, q2);
  assert (select stock_deducted_at from public.invoices where uid = inv) is null, 'cancel must clear the stamp';

  -- 12. Reopening a cancelled work order deducts again.
  update public.invoices set status = 'work_order' where uid = inv;
  select quantity into q1 from public.materials where uid = m1;
  select quantity into q2 from public.materials where uid = m2;
  assert q1 = 6 and q2 = -15, format('reopen must deduct again, got %s / %s', q1, q2);

  -- 13. Deleting a deducted invoice the way the app does (lines first) restores.
  delete from public.invoice_items where invoice_id = inv;
  delete from public.invoices where uid = inv;
  select quantity into q1 from public.materials where uid = m1;
  select quantity into q2 from public.materials where uid = m2;
  assert q1 = 10 and q2 = 5, format('deleting a work order must restore, got %s / %s', q1, q2);

  -- 14. Deleting an estimate leaves stock alone.
  insert into public.invoices (invoice_number, status, organization_id) values ('HT54-2', 'estimate', org) returning uid into inv;
  insert into public.invoice_items (invoice_id, type, material_id, quantity, organization_id) values (inv, 'material', m1, 7, org);
  delete from public.invoice_items where invoice_id = inv;
  delete from public.invoices where uid = inv;
  select quantity into q1 from public.materials where uid = m1;
  assert q1 = 10, format('deleting an estimate must not move stock, got %s', q1);

  -- 15. A row inserted straight in as a work order is stamped and its lines deduct.
  insert into public.invoices (invoice_number, status, organization_id) values ('HT54-3', 'work_order', org) returning uid into inv;
  assert (select stock_deducted_at from public.invoices where uid = inv) is not null, 'a new work order must be stamped';
  insert into public.invoice_items (invoice_id, type, material_id, quantity, organization_id) values (inv, 'material', m1, 2, org);
  select quantity into q1 from public.materials where uid = m1;
  assert q1 = 8, format('lines added to a new work order must deduct, got %s', q1);

  -- 16. A material in another organisation is never touched.
  insert into public.organizations (name, subdomain, status) values ('HT-54 other org', 'ht54-other', 'inactive') returning id into other_org;
  update public.materials set organization_id = other_org where uid = m2;
  update public.invoice_items set quantity = 2 where invoice_id = inv;
  insert into public.invoice_items (invoice_id, type, material_id, quantity, organization_id) values (inv, 'material', m2, 100, org);
  select quantity into q2 from public.materials where uid = m2;
  assert q2 = 5, format('a material of another organisation must not move, got %s', q2);

  raise notice 'HT-54: all checks passed';
end
$$;

rollback;
