ALTER TABLE "print_tasks" ADD COLUMN "bin_number" integer;--> statement-breakpoint
ALTER TABLE "print_tasks" ADD COLUMN "picked_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "print_tasks" ADD COLUMN "print_options" text;