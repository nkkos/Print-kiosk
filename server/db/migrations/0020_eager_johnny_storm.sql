CREATE TABLE "photo_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"spec_label" text NOT NULL,
	"spec_width_mm" real NOT NULL,
	"spec_height_mm" real NOT NULL,
	"spec_dpi" integer,
	"shot_count" integer NOT NULL,
	"status" text DEFAULT 'paid' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"printed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "photo_orders" ADD CONSTRAINT "photo_orders_session_id_kiosk_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."kiosk_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photo_orders_session_id_idx" ON "photo_orders" USING btree ("session_id");