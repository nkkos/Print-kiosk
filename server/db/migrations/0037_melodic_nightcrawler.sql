ALTER TABLE "payment_items" ADD COLUMN "print_order_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_items" ADD COLUMN "shop_order_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_print_order_id_print_orders_id_fk" FOREIGN KEY ("print_order_id") REFERENCES "public"."print_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_shop_order_id_shop_orders_id_fk" FOREIGN KEY ("shop_order_id") REFERENCES "public"."shop_orders"("id") ON DELETE set null ON UPDATE no action;