-- Vendors' own promo codes, for their packages only
-- AlterTable
ALTER TABLE "promo_codes" ADD COLUMN "vendor_id" TEXT,
ADD COLUMN "listing_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "promo_codes_vendor_id_idx" ON "promo_codes"("vendor_id");

-- AddForeignKey
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
