-- CreateIndex: Notification (table "Notification")
CREATE INDEX IF NOT EXISTS "Notification_receiver_id_idx" ON "Notification"("receiver_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_sender_id_idx" ON "Notification"("sender_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_read_at_idx" ON "Notification"("read_at");

-- CreateIndex: Message (table "Message")
CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Message_senderId_idx" ON "Message"("senderId");
