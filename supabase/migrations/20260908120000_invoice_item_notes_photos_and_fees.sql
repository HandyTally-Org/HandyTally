-- Line item notes and photos, plus invoice-level fees.
--
-- Photos are stored inline on the item as a JSON array of
-- { file_type, file_data } objects, where file_data is base64. This matches
-- how company_attachments.file_data already stores the company logo, and it
-- survives the delete-and-reinsert save path used for invoice_items: a
-- separate photos table keyed by invoice_item_id would lose its rows on
-- every save, since the item ids change.

ALTER TABLE "public"."invoice_items"
    ADD COLUMN IF NOT EXISTS "notes" "text";

ALTER TABLE "public"."invoice_items"
    ADD COLUMN IF NOT EXISTS "photos" "jsonb" DEFAULT '[]'::"jsonb";

-- Fees are charged either as a percentage of the subtotal ('percent') or as a
-- flat amount ('fixed'), and are taxable: fee_amount is added to the subtotal
-- before tax_rate is applied. A null or zero fee_value contributes nothing.
ALTER TABLE "public"."invoices"
    ADD COLUMN IF NOT EXISTS "fee_type" "text" DEFAULT 'fixed';

ALTER TABLE "public"."invoices"
    ADD COLUMN IF NOT EXISTS "fee_value" numeric DEFAULT 0;

ALTER TABLE "public"."invoices"
    ADD COLUMN IF NOT EXISTS "fee_amount" numeric DEFAULT 0;

ALTER TABLE "public"."invoices"
    DROP CONSTRAINT IF EXISTS "invoices_fee_type_check";

ALTER TABLE "public"."invoices"
    ADD CONSTRAINT "invoices_fee_type_check"
    CHECK ("fee_type" IS NULL OR "fee_type" IN ('fixed', 'percent'));
