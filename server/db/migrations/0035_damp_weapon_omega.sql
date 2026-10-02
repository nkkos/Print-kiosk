CREATE TABLE "fiscal_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_order_id" uuid NOT NULL,
	"refund_id" uuid,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"delivery" text NOT NULL,
	"email" text,
	"document" text NOT NULL,
	"receipt_uid" text,
	"okp" text,
	"receipt_number" text,
	"cash_register_code" text,
	"registered_at" timestamp with time zone,
	"failure_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_payment_order_id_payment_orders_id_fk" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_refund_id_payment_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."payment_refunds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fiscal_receipts_payment_order_id_idx" ON "fiscal_receipts" USING btree ("payment_order_id");--> statement-breakpoint
CREATE INDEX "fiscal_receipts_status_idx" ON "fiscal_receipts" USING btree ("status");