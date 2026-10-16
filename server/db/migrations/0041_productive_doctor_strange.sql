CREATE TABLE "door_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid
);
--> statement-breakpoint
CREATE TABLE "door_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"detail" text,
	"staff_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pavilion_door" (
	"id" text PRIMARY KEY NOT NULL,
	"override_mode" text,
	"override_until" timestamp with time zone,
	"visit_requested_at" timestamp with time zone,
	"lock_state" text,
	"door_state" text,
	"lock_reachable" boolean,
	"battery_critical" boolean,
	"applied_mode" text,
	"reported_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "door_closures" ADD CONSTRAINT "door_closures_created_by_staff_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "door_closures" ADD CONSTRAINT "door_closures_cancelled_by_staff_accounts_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."staff_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "door_events" ADD CONSTRAINT "door_events_staff_account_id_staff_accounts_id_fk" FOREIGN KEY ("staff_account_id") REFERENCES "public"."staff_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "door_events_created_at_idx" ON "door_events" USING btree ("created_at");