-- Emails are now matched in lower case. Lower-case stored emails, except where two accounts would
-- collide (those keep their spelling and still sign in exactly as stored).
UPDATE "users" AS u
SET "email" = lower(trim(u."email"))
WHERE u."email" IS NOT NULL
  AND u."email" <> lower(trim(u."email"))
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS o
    WHERE o."id" <> u."id" AND lower(trim(o."email")) = lower(trim(u."email"))
  );
