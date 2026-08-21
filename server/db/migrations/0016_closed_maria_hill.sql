CREATE TABLE "staff_roster" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_of_week" text NOT NULL,
	"staff_account_id" uuid NOT NULL,
	CONSTRAINT "staff_roster_day_of_week_unique" UNIQUE("day_of_week")
);
--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_roster" ADD CONSTRAINT "staff_roster_staff_account_id_staff_accounts_id_fk" FOREIGN KEY ("staff_account_id") REFERENCES "public"."staff_accounts"("id") ON DELETE cascade ON UPDATE no action;