-- The vendor can set how long a package's service runs instead of the customer choosing
-- AlterTable
ALTER TABLE "vendor_listings" ADD COLUMN "customer_sets_duration" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "service_duration_minutes" INTEGER;
