-- Delivery fee on rental orders the vendor delivers, measured from the business address (booking/travel-fee.ts)
ALTER TABLE "vendor_profiles" ADD COLUMN "rental_travel_fee_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "rental_travel_free_miles" INTEGER,
ADD COLUMN "rental_travel_per_mile" DECIMAL(10,2),
ADD COLUMN "rental_travel_base_fee" DECIMAL(10,2),
ADD COLUMN "rental_travel_round_trip" BOOLEAN NOT NULL DEFAULT false;
