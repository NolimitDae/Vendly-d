-- Delivery / travel fee by distance, set per package (booking/travel-fee.ts)
ALTER TABLE "vendor_listings" ADD COLUMN "travel_fee_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "travel_free_miles" INTEGER,
ADD COLUMN "travel_per_mile" DECIMAL(10,2),
ADD COLUMN "travel_base_fee" DECIMAL(10,2),
ADD COLUMN "travel_round_trip" BOOLEAN NOT NULL DEFAULT false;

-- The fee on a booking (already part of amount) and how it was worked out
ALTER TABLE "bookings" ADD COLUMN "travel_fee" DECIMAL(10,2),
ADD COLUMN "travel_details" JSONB;
