ALTER TABLE "photo_documents" ALTER COLUMN "eye_line_from_bottom_mm" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "photo_documents" ADD COLUMN "margin_top_mm" real;--> statement-breakpoint
ALTER TABLE "photo_documents" ADD COLUMN "head_width_min_mm" real;--> statement-breakpoint
ALTER TABLE "photo_documents" ADD COLUMN "head_width_max_mm" real;