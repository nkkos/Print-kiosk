CREATE TABLE "account_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"folder_id" uuid,
	"file_name" text NOT NULL,
	"storage_path" text NOT NULL,
	"status" text DEFAULT 'scanning' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "print_orders" ADD COLUMN "account_file_id" uuid;--> statement-breakpoint
ALTER TABLE "account_files" ADD CONSTRAINT "account_files_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_files" ADD CONSTRAINT "account_files_folder_id_account_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."account_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_folders" ADD CONSTRAINT "account_folders_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_files_account_id_idx" ON "account_files" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_files_folder_id_idx" ON "account_files" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "account_folders_account_id_idx" ON "account_folders" USING btree ("account_id");--> statement-breakpoint
ALTER TABLE "print_orders" ADD CONSTRAINT "print_orders_account_file_id_account_files_id_fk" FOREIGN KEY ("account_file_id") REFERENCES "public"."account_files"("id") ON DELETE set null ON UPDATE no action;