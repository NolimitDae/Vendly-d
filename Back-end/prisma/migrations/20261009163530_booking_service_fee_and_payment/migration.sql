-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "payout_credited_at" TIMESTAMP(3),
ADD COLUMN     "service_fee" DECIMAL(10,2);
