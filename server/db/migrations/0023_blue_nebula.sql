ALTER TABLE "photo_documents" ADD COLUMN "price_cents" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
ALTER TABLE "photo_orders" ADD COLUMN "amount_cents" integer DEFAULT 0 NOT NULL;