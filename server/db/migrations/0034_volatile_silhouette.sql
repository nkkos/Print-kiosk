CREATE TABLE "payment_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_order_id" uuid NOT NULL,
	"payment_item_id" uuid,
	"amount_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_refund_id" text,
	"failure_reason" text,
	"created_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_order_id_payment_orders_id_fk" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_item_id_payment_items_id_fk" FOREIGN KEY ("payment_item_id") REFERENCES "public"."payment_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_refunds_payment_order_id_idx" ON "payment_refunds" USING btree ("payment_order_id");--> statement-breakpoint
CREATE INDEX "payment_refunds_payment_item_id_idx" ON "payment_refunds" USING btree ("payment_item_id");