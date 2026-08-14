CREATE TABLE "scan_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_session_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"raw_storage_path" text NOT NULL,
	"processed_storage_path" text,
	"status" text DEFAULT 'processing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"delivery_methods" text,
	"delivered_to_email" text,
	"account_file_id" uuid,
	"final_storage_path" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scan_pages" ADD CONSTRAINT "scan_pages_scan_session_id_scan_sessions_id_fk" FOREIGN KEY ("scan_session_id") REFERENCES "public"."scan_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_sessions" ADD CONSTRAINT "scan_sessions_account_file_id_account_files_id_fk" FOREIGN KEY ("account_file_id") REFERENCES "public"."account_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scan_pages_scan_session_id_idx" ON "scan_pages" USING btree ("scan_session_id");--> statement-breakpoint
CREATE INDEX "scan_sessions_session_id_idx" ON "scan_sessions" USING btree ("session_id");