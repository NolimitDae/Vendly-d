-- Customers can come to the vendor instead (pickup, drop-off); the vendor chooses whether a guest count is required
ALTER TABLE "vendor_listings" ADD COLUMN "customer_can_come" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vendor_listings" ADD COLUMN "guest_count_required" BOOLEAN;

-- Rental items: delivered by the vendor and/or picked up by the customer
ALTER TABLE "rental_items" ADD COLUMN "offers_delivery" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "rental_items" ADD COLUMN "offers_pickup" BOOLEAN NOT NULL DEFAULT true;

-- The customer chose to come to the vendor for this booking
ALTER TABLE "bookings" ADD COLUMN "customer_comes" BOOLEAN NOT NULL DEFAULT false;
