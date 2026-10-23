-- AlterTable
ALTER TABLE "booking_extras" ADD COLUMN     "extends_minutes" INTEGER;

-- AlterTable
ALTER TABLE "booking_installments" ADD COLUMN     "receipt_sent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "dispute_category" VARCHAR(40),
ADD COLUMN     "dispute_outcome" VARCHAR(20),
ADD COLUMN     "dispute_photos" TEXT[],
ADD COLUMN     "dispute_requested_amount" DECIMAL(10,2),
ADD COLUMN     "invoice_sent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "completed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user_reports" ADD COLUMN     "message_attachments" TEXT[],
ADD COLUMN     "message_text" TEXT;

-- AlterTable
ALTER TABLE "vendor_profiles" ADD COLUMN     "working_hours" JSONB;

-- Backfill: past charges and finished bookings never get a receipt or invoice email after the fact.
UPDATE "booking_installments" SET "receipt_sent_at" = COALESCE("paid_at", "updated_at")
WHERE "status" IN ('PAID', 'REFUNDED') AND "receipt_sent_at" IS NULL;
UPDATE "bookings" SET "invoice_sent_at" = COALESCE("released_at", "completed_at", "updated_at")
WHERE "status" IN ('COMPLETED', 'CANCELLED', 'REJECTED') AND "invoice_sent_at" IS NULL;

-- Backfill: finished events get their best-known finish time.
UPDATE "events" SET "completed_at" = "updated_at" WHERE "status" = 'COMPLETED' AND "completed_at" IS NULL;
UPDATE "events" SET "cancelled_at" = "updated_at" WHERE "status" = 'CANCELLED' AND "cancelled_at" IS NULL;
