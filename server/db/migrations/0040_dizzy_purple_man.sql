ALTER TABLE "stands" ADD COLUMN "reload_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stands" ADD COLUMN "reload_force" boolean DEFAULT false NOT NULL;