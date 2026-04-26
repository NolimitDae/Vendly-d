-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_receiver_id_idx" ON "Notification"("receiver_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_sender_id_idx" ON "Notification"("sender_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_read_at_idx" ON "Notification"("read_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Booking_customer_id_idx" ON "Booking"("customer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Booking_vendor_id_idx" ON "Booking"("vendor_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Booking_listing_id_idx" ON "Booking"("listing_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Booking_created_at_idx" ON "Booking"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VendorListing_vendor_id_idx" ON "VendorListing"("vendor_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VendorListing_category_id_idx" ON "VendorListing"("category_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VendorListing_status_idx" ON "VendorListing"("status");
