ALTER TABLE "companies" ADD COLUMN "vat_rate_percent" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_invoice_items" ADD COLUMN "vat_amount_cents" integer;--> statement-breakpoint
UPDATE "company_invoice_items" SET "vat_amount_cents" = 0 WHERE "vat_amount_cents" IS NULL;--> statement-breakpoint
ALTER TABLE "company_invoice_items" ALTER COLUMN "vat_amount_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "company_invoices" ADD COLUMN "vat_rate_percent" integer;--> statement-breakpoint
ALTER TABLE "company_invoices" ADD COLUMN "total_net_cents" integer;--> statement-breakpoint
ALTER TABLE "company_invoices" ADD COLUMN "total_vat_cents" integer;--> statement-breakpoint
-- Backfills pre-VAT-tracking rows (this session's own dev-test invoices):
-- their old `total_cents` was already a net-only figure (no VAT concept
-- existed yet), so it becomes the net total with zero VAT recorded, at the
-- default 20% rate — informational only, nothing was ever really issued
-- against these.
UPDATE "company_invoices" SET "vat_rate_percent" = 20, "total_net_cents" = "total_cents", "total_vat_cents" = 0 WHERE "vat_rate_percent" IS NULL;--> statement-breakpoint
ALTER TABLE "company_invoices" ALTER COLUMN "vat_rate_percent" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "company_invoices" ALTER COLUMN "total_net_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "company_invoices" ALTER COLUMN "total_vat_cents" SET NOT NULL;
