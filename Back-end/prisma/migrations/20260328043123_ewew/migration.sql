/*
  Warnings:

  - You are about to drop the column `business_name` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `license_photo` on the `users` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ADMIN_APPROVE_STATUS" AS ENUM ('PENDING', 'APPROVED', 'NOT_APPLICABLE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "users" DROP COLUMN "business_name",
DROP COLUMN "license_photo";

-- CreateTable
CREATE TABLE "vendor_profiles" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,
    "license_photo" TEXT[],
    "license_status" "ADMIN_APPROVE_STATUS" NOT NULL DEFAULT 'PENDING',
    "approved_at" TIMESTAMP(3),
    "business_name" VARCHAR(255),
    "about_me" TEXT,
    "address" TEXT,

    CONSTRAINT "vendor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_profiles_user_id_key" ON "vendor_profiles"("user_id");

-- AddForeignKey
ALTER TABLE "vendor_profiles" ADD CONSTRAINT "vendor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
