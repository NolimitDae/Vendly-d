-- AlterTable
ALTER TABLE "vendor_listings" ADD COLUMN     "geocoded_at" TIMESTAMP(3),
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "vendor_listings_lat_lng_idx" ON "vendor_listings"("lat", "lng");
