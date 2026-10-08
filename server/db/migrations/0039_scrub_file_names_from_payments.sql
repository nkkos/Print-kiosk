-- Payment records keep the financial fact, not the customer's file name
-- (server/dataRetention.ts, docs/data-privacy-requirements.md): drop the
-- name from kiosk payment lines' print configuration and from online
-- checkout lines' descriptions written before this change.
UPDATE "payment_items" SET "print_config" = ("print_config"::jsonb - 'fileName')::text WHERE "print_config" LIKE '%"fileName"%';--> statement-breakpoint
UPDATE "payment_items" SET "description" = 'Tlač dokumentu' WHERE "description" LIKE 'Tlač: %';
