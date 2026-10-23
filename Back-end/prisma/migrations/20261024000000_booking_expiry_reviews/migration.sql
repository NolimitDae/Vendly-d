ALTER TABLE "bookings" ADD COLUMN "request_opened_at" TIMESTAMP(3),
ADD COLUMN "expiry_reminded_at" TIMESTAMP(3),
ADD COLUMN "expired_at" TIMESTAMP(3),
ADD COLUMN "review_reminded_at" TIMESTAMP(3),
ADD COLUMN "review_prompt_dismissed_at" TIMESTAMP(3);

-- the hourly jobs look for open requests and finished bookings
CREATE INDEX "bookings_status_created_at_idx" ON "bookings"("status", "created_at");
CREATE INDEX "bookings_status_completed_at_idx" ON "bookings"("status", "completed_at");
