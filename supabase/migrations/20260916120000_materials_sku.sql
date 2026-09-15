-- Inventory: add a SKU column to materials.
--
-- The Inventory screen now shows SKU, Name, Description, Quantity, Unit Cost,
-- Supplier and Category. `quantity` already exists (numeric); only `sku` is new.
-- SKU is free text and optional: suppliers use their own formats and existing
-- rows have none. It is not unique because the same part can legitimately be
-- entered under more than one supplier.

alter table "public"."materials"
  add column if not exists "sku" text;

comment on column "public"."materials"."sku" is
  'Stock keeping unit shown first in the Inventory table. Optional free text.';
