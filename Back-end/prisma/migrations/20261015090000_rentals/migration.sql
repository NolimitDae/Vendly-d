-- CreateEnum
CREATE TYPE "RentalItemStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "RentalReservationStatus" AS ENUM ('ACTIVE', 'RETURNED', 'CANCELLED');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "security_deposit" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "booking_installments" ADD COLUMN     "kind" VARCHAR(30) NOT NULL DEFAULT 'charge';

-- CreateTable
CREATE TABLE "rental_items" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "vendor_id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "images" TEXT[],
    "category_id" TEXT,
    "daily_rate" DECIMAL(10,2) NOT NULL,
    "deposit_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "turnaround_hours" INTEGER NOT NULL DEFAULT 24,
    "location" VARCHAR(255),
    "status" "RentalItemStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "rental_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_reservations" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "item_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "daily_rate" DECIMAL(10,2) NOT NULL,
    "status" "RentalReservationStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "rental_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_returns" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "booking_id" TEXT NOT NULL,
    "photos" TEXT[],
    "notes" TEXT,
    "damage_reported" BOOLEAN NOT NULL DEFAULT false,
    "damage_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "late_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "recorded_by" TEXT NOT NULL,

    CONSTRAINT "rental_returns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rental_items_vendor_id_idx" ON "rental_items"("vendor_id");

-- CreateIndex
CREATE INDEX "rental_items_status_idx" ON "rental_items"("status");

-- CreateIndex
CREATE INDEX "rental_reservations_item_id_start_date_end_date_idx" ON "rental_reservations"("item_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "rental_reservations_booking_id_idx" ON "rental_reservations"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "rental_returns_booking_id_key" ON "rental_returns"("booking_id");

-- AddForeignKey
ALTER TABLE "rental_items" ADD CONSTRAINT "rental_items_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_reservations" ADD CONSTRAINT "rental_reservations_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "rental_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_reservations" ADD CONSTRAINT "rental_reservations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_returns" ADD CONSTRAINT "rental_returns_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
