-- CreateTable
CREATE TABLE "listing_availability" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listing_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" VARCHAR(255),

    CONSTRAINT "listing_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_proofs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "booking_id" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "photos" TEXT[],
    "notes" TEXT,

    CONSTRAINT "booking_proofs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "listing_availability" ADD CONSTRAINT "listing_availability_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "vendor_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_proofs" ADD CONSTRAINT "booking_proofs_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_proofs" ADD CONSTRAINT "booking_proofs_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
