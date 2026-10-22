-- CreateEnum
CREATE TYPE "IdentityVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "id_verified_at" TIMESTAMP(3),
ADD COLUMN     "roles" "UserType"[] DEFAULT ARRAY[]::"UserType"[];

-- CreateTable
CREATE TABLE "identity_verifications" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "IdentityVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "document_type" VARCHAR(32) NOT NULL,
    "legal_name" VARCHAR(255) NOT NULL,
    "front_key" TEXT NOT NULL,
    "back_key" TEXT,
    "selfie_key" TEXT NOT NULL,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,

    CONSTRAINT "identity_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "identity_verifications_status_created_at_idx" ON "identity_verifications"("status", "created_at");

-- CreateIndex
CREATE INDEX "identity_verifications_user_id_idx" ON "identity_verifications"("user_id");

-- AddForeignKey
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing accounts hold the role they signed up with.
UPDATE "users" SET "roles" = ARRAY["type"] WHERE "type" IS NOT NULL AND cardinality("roles") = 0;
