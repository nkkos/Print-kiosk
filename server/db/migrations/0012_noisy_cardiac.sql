CREATE TABLE "copy_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"copy_session_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"raw_storage_path" text NOT NULL,
	"processed_storage_path" text,
	"status" text DEFAULT 'processing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copy_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"result_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "copy_pages" ADD CONSTRAINT "copy_pages_copy_session_id_copy_sessions_id_fk" FOREIGN KEY ("copy_session_id") REFERENCES "public"."copy_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copy_sessions" ADD CONSTRAINT "copy_sessions_result_file_id_uploaded_files_id_fk" FOREIGN KEY ("result_file_id") REFERENCES "public"."uploaded_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "copy_pages_copy_session_id_idx" ON "copy_pages" USING btree ("copy_session_id");--> statement-breakpoint
CREATE INDEX "copy_sessions_session_id_idx" ON "copy_sessions" USING btree ("session_id");