-- Add-ons and fees made "for this package only" go in the vendor's library too, so vendors can find and
-- edit them there (new ones always do now)
UPDATE "vendor_add_ons" SET "in_library" = true WHERE "in_library" = false AND "deleted_at" IS NULL;
