-- DropIndex
DROP INDEX "booking_contracts_supersedes_id_key";

-- CreateIndex
CREATE INDEX "booking_contracts_supersedes_id_idx" ON "booking_contracts"("supersedes_id");
