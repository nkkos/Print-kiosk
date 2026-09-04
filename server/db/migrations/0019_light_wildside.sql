CREATE TABLE "photo_countries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"label" text NOT NULL,
	"photo_width_mm" real NOT NULL,
	"photo_height_mm" real NOT NULL,
	"dpi" integer NOT NULL,
	"head_height_min_mm" real NOT NULL,
	"head_height_max_mm" real NOT NULL,
	"eye_line_from_bottom_mm" real NOT NULL,
	"background_requirement" text,
	"print_notes" text,
	"instructions" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photo_documents" ADD CONSTRAINT "photo_documents_country_id_photo_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."photo_countries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photo_documents_country_id_idx" ON "photo_documents" USING btree ("country_id");