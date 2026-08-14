ALTER TABLE "print_orders" ADD COLUMN "status" text DEFAULT 'created' NOT NULL;--> statement-breakpoint
ALTER TABLE "print_tasks" ADD COLUMN "print_order_id" uuid;--> statement-breakpoint
ALTER TABLE "print_tasks" ADD CONSTRAINT "print_tasks_print_order_id_print_orders_id_fk" FOREIGN KEY ("print_order_id") REFERENCES "public"."print_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill: every row created before this migration was created by the old
-- always-paid-immediately flow (a paymentOrderId was always assigned) — the
-- new 'created' default would otherwise mislabel them as unpaid.
UPDATE "print_orders" SET "status" = 'paid' WHERE "payment_order_id" IS NOT NULL;