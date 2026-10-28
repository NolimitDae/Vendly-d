-- Customers' favourite vendors (beside saved_listings)
-- CreateTable
CREATE TABLE "saved_vendors" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,

    CONSTRAINT "saved_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saved_vendors_user_id_vendor_id_key" ON "saved_vendors"("user_id", "vendor_id");

-- AddForeignKey
ALTER TABLE "saved_vendors" ADD CONSTRAINT "saved_vendors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_vendors" ADD CONSTRAINT "saved_vendors_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
