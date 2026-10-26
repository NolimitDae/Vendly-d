-- Booking tracker: the venue on the map, the vendor's day-of steps, the vendor's private business address
-- and where each package happens (all additive)
ALTER TABLE "bookings" ADD COLUMN "venue_lat" DOUBLE PRECISION,
ADD COLUMN "venue_lng" DOUBLE PRECISION,
ADD COLUMN "venue_geocoded_at" TIMESTAMP(3),
ADD COLUMN "confirmed_at" TIMESTAMP(3),
ADD COLUMN "started_at" TIMESTAMP(3),
ADD COLUMN "en_route_at" TIMESTAMP(3),
ADD COLUMN "arrived_at" TIMESTAMP(3),
ADD COLUMN "checked_in_at" TIMESTAMP(3);

ALTER TABLE "vendor_profiles" ADD COLUMN "business_address" VARCHAR(500),
ADD COLUMN "business_lat" DOUBLE PRECISION,
ADD COLUMN "business_lng" DOUBLE PRECISION,
ADD COLUMN "business_geocoded_at" TIMESTAMP(3);

-- existing packages keep working as before: the vendor goes to the customer
ALTER TABLE "vendor_listings" ADD COLUMN "service_at" VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER_LOCATION';
