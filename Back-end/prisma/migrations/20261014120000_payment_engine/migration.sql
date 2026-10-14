-- CreateEnum
CREATE TYPE "PaymentPlan" AS ENUM ('FULL_ON_ACCEPT', 'DEPOSIT_50', 'DEPOSIT_25', 'PAY_AFTER_SERVICE');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('SCHEDULED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');

-- AlterTable
ALTER TABLE "vendor_listings" ADD COLUMN     "payment_plan" "PaymentPlan";

-- AlterTable
ALTER TABLE "service_categories" ADD COLUMN     "default_payment_plan" "PaymentPlan";

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "payment_plan" "PaymentPlan",
ADD COLUMN     "payment_method_id" TEXT,
ADD COLUMN     "release_at" TIMESTAMP(3),
ADD COLUMN     "released_at" TIMESTAMP(3),
ADD COLUMN     "transfer_id" TEXT,
ADD COLUMN     "customer_approved_at" TIMESTAMP(3),
ADD COLUMN     "dispute_opened_at" TIMESTAMP(3),
ADD COLUMN     "dispute_reason" TEXT,
ADD COLUMN     "dispute_resolved_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "booking_installments" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "booking_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "due_at" TIMESTAMP(3) NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "capture_manually" BOOLEAN NOT NULL DEFAULT false,
    "payment_intent_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "paid_at" TIMESTAMP(3),
    "refunded_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "booking_installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_installments_booking_id_idx" ON "booking_installments"("booking_id");

-- CreateIndex
CREATE INDEX "booking_installments_status_next_attempt_at_idx" ON "booking_installments"("status", "next_attempt_at");

-- AddForeignKey
ALTER TABLE "booking_installments" ADD CONSTRAINT "booking_installments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
