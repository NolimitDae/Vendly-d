-- Who cancelled a booking and the reason they picked
ALTER TABLE "bookings" ADD COLUMN "cancelled_by" VARCHAR(20);
ALTER TABLE "bookings" ADD COLUMN "cancel_reason_code" VARCHAR(40);

-- Deposit plans: a missed deposit or balance has to be paid by this time
ALTER TABLE "bookings" ADD COLUMN "payment_due_by" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "payment_due_kind" VARCHAR(20);
ALTER TABLE "bookings" ADD COLUMN "payment_due_reminded_at" TIMESTAMP(3);

-- Backfill: bookings made before this release keep the old rules (a failed charge is retried over
-- 48 hours and then waits for the customer; the cancellation policy alone decides refunds). New
-- bookings get the new rules through the column default.
ALTER TABLE "bookings" ADD COLUMN "deposit_rules" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bookings" ALTER COLUMN "deposit_rules" SET DEFAULT true;

-- Admins were told a vendor cancelled too many bookings
ALTER TABLE "users" ADD COLUMN "cancellations_alerted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "bookings_payment_due_by_idx" ON "bookings"("payment_due_by");

-- CreateIndex
CREATE INDEX "bookings_vendor_id_cancelled_at_idx" ON "bookings"("vendor_id", "cancelled_at");
