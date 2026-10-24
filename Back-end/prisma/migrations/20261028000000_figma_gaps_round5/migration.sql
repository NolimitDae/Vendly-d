-- Notification preferences saved on the server (null = everything on)
ALTER TABLE "users" ADD COLUMN "notification_prefs" JSONB;

-- Package details: what's included and minimum notice
ALTER TABLE "vendor_listings" ADD COLUMN "included_items" TEXT[];
ALTER TABLE "vendor_listings" ADD COLUMN "min_notice_hours" INTEGER;

-- Reference photos on a booking request
ALTER TABLE "bookings" ADD COLUMN "request_photos" TEXT[];

-- A contract can apply to whole categories
ALTER TABLE "vendor_contracts" ADD COLUMN "category_ids" TEXT[];

-- Promo code limits
ALTER TABLE "promo_codes" ADD COLUMN "once_per_customer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "promo_codes" ADD COLUMN "first_booking_only" BOOLEAN NOT NULL DEFAULT false;
