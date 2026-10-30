-- A package's own deposit percent, with the balance due some days before the event or after the service
-- AlterEnum
ALTER TYPE "PaymentPlan" ADD VALUE 'DEPOSIT_CUSTOM';

-- AlterTable
ALTER TABLE "vendor_listings" ADD COLUMN "deposit_percent" INTEGER,
ADD COLUMN "balance_due_days" INTEGER,
ADD COLUMN "balance_after_service" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "deposit_percent" INTEGER,
ADD COLUMN "balance_due_days" INTEGER,
ADD COLUMN "balance_after_service" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "booking_installments" ADD COLUMN "after_service" BOOLEAN NOT NULL DEFAULT false;
