CREATE TABLE "payment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_order_id" uuid NOT NULL,
	"cart_item_id" text NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"vat_rate_percent" integer NOT NULL,
	"print_config" text NOT NULL,
	"print_task_id" uuid,
	"refunded_cents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "channel" text DEFAULT 'online-checkout' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "stand_id" text;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "provider_session_id" text;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "provider_transaction_id" text;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_payment_order_id_payment_orders_id_fk" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_items_payment_order_id_idx" ON "payment_items" USING btree ("payment_order_id");