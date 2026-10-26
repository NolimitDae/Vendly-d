-- When the vendor first replied in a 1:1 chat: lifts the customer's 3-message limit for good
ALTER TABLE "Conversation" ADD COLUMN "vendor_replied_at" TIMESTAMP(3);

-- chats where the vendor has already replied
UPDATE "Conversation" c SET "vendor_replied_at" = sub.first_reply
FROM (
  SELECT m."conversationId" AS id, MIN(m."createdAt") AS first_reply
  FROM "Message" m
  JOIN "users" u ON u.id = m."senderId"
  WHERE m.kind <> 'system' AND (u.type = 'VENDOR' OR 'VENDOR' = ANY(u.roles))
  GROUP BY m."conversationId"
) sub
WHERE c.id = sub.id AND c.is_group = false;
