-- CreateEnum
CREATE TYPE "AddOnKind" AS ENUM ('ADD_ON', 'FEE');

-- CreateEnum
CREATE TYPE "AddOnPriceUnit" AS ENUM ('FIXED', 'PER_PERSON', 'PER_HOUR', 'PER_ITEM');

-- CreateEnum
CREATE TYPE "BookingExtraStatus" AS ENUM ('INCLUDED', 'PENDING', 'APPROVED', 'DECLINED', 'CANCELLED', 'IN_REVIEW', 'WAIVED');

-- AlterTable
ALTER TABLE "booking_installments" ADD COLUMN     "paid_out_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "money_lock_token" VARCHAR(64),
ADD COLUMN     "money_lock_until" TIMESTAMP(3),
ADD COLUMN     "released_gross" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "vendor_listings" ADD COLUMN     "max_quantity" INTEGER,
ADD COLUMN     "min_quantity" INTEGER;

-- CreateTable
CREATE TABLE "vendor_add_ons" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "vendor_id" TEXT NOT NULL,
    "kind" "AddOnKind" NOT NULL DEFAULT 'ADD_ON',
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "price" DECIMAL(10,2) NOT NULL,
    "price_unit" "AddOnPriceUnit" NOT NULL DEFAULT 'FIXED',
    "max_quantity" INTEGER,
    "in_library" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "vendor_add_ons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_add_ons" (
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listing_id" TEXT NOT NULL,
    "add_on_id" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "listing_add_ons_pkey" PRIMARY KEY ("listing_id","add_on_id")
);

-- CreateTable
CREATE TABLE "booking_extras" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "booking_id" TEXT NOT NULL,
    "add_on_id" TEXT,
    "kind" "AddOnKind" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "unit_price" DECIMAL(10,2) NOT NULL,
    "price_unit" "AddOnPriceUnit" NOT NULL DEFAULT 'FIXED',
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "amount" DECIMAL(10,2) NOT NULL,
    "fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "status" "BookingExtraStatus" NOT NULL,
    "responded_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "reminded_at" TIMESTAMP(3),
    "review_requested_at" TIMESTAMP(3),
    "review_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "installment_id" TEXT,

    CONSTRAINT "booking_extras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_add_ons_vendor_id_kind_idx" ON "vendor_add_ons"("vendor_id", "kind");

-- CreateIndex
CREATE INDEX "listing_add_ons_add_on_id_idx" ON "listing_add_ons"("add_on_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_extras_installment_id_key" ON "booking_extras"("installment_id");

-- CreateIndex
CREATE INDEX "booking_extras_booking_id_idx" ON "booking_extras"("booking_id");

-- CreateIndex
CREATE INDEX "booking_extras_status_created_at_idx" ON "booking_extras"("status", "created_at");

-- AddForeignKey
ALTER TABLE "vendor_add_ons" ADD CONSTRAINT "vendor_add_ons_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_add_ons" ADD CONSTRAINT "listing_add_ons_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "vendor_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_add_ons" ADD CONSTRAINT "listing_add_ons_add_on_id_fkey" FOREIGN KEY ("add_on_id") REFERENCES "vendor_add_ons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_extras" ADD CONSTRAINT "booking_extras_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_extras" ADD CONSTRAINT "booking_extras_add_on_id_fkey" FOREIGN KEY ("add_on_id") REFERENCES "vendor_add_ons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_extras" ADD CONSTRAINT "booking_extras_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "booking_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: installments paid before their booking was paid out went out with it.
-- (Anything paid after that was never paid out; the payout sweep now sends it.)
UPDATE "booking_installments" i
SET "paid_out_at" = b."released_at"
FROM "bookings" b
WHERE i."booking_id" = b."id"
  AND b."released_at" IS NOT NULL
  AND i."status" IN ('PAID', 'REFUNDED')
  AND (i."paid_at" IS NULL OR i."paid_at" <= b."released_at")
  AND i."paid_out_at" IS NULL;
