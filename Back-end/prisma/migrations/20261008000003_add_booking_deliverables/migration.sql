-- CreateTable
CREATE TABLE "booking_deliverables" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "booking_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT,
    "files" TEXT[],
    "links" TEXT[],

    CONSTRAINT "booking_deliverables_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "booking_deliverables" ADD CONSTRAINT "booking_deliverables_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_deliverables" ADD CONSTRAINT "booking_deliverables_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
