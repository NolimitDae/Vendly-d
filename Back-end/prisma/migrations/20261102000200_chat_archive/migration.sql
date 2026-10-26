-- When this person archived the chat (per person: hides it from their main list only)
ALTER TABLE "Participant" ADD COLUMN "archivedAt" TIMESTAMP(3);
