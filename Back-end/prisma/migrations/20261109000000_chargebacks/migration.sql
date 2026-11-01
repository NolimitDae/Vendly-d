-- Customers' bank disputes (chargebacks): an open one holds the booking's payout
-- CreateTable
CREATE TABLE "chargebacks" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "booking_id" TEXT,
    "installment_id" TEXT,
    "payment_intent_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'usd',
    "reason" VARCHAR(100),
    "status" VARCHAR(40) NOT NULL,
    "respond_by" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "chargebacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chargebacks_booking_id_idx" ON "chargebacks"("booking_id");

-- AddForeignKey
ALTER TABLE "chargebacks" ADD CONSTRAINT "chargebacks_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

