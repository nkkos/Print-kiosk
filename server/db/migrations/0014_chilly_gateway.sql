CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"code" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"context" text,
	"auto_remediation" text,
	"correlation_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "incidents_source_idx" ON "incidents" USING btree ("source");--> statement-breakpoint
CREATE INDEX "incidents_correlation_id_idx" ON "incidents" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "incidents_resolved_at_idx" ON "incidents" USING btree ("resolved_at");