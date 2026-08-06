ALTER TABLE "account_tokens" DROP CONSTRAINT "account_tokens_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "kiosk_sessions" DROP CONSTRAINT "kiosk_sessions_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "print_orders" DROP CONSTRAINT "print_orders_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kiosk_sessions" ADD CONSTRAINT "kiosk_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_orders" ADD CONSTRAINT "print_orders_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;