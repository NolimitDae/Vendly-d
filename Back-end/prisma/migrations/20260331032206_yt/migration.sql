/*
  Warnings:

  - Made the column `operated_by` on table `services` required. This step will fail if there are existing NULL values in that column.
  - Made the column `working_type` on table `services` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "services" ADD COLUMN     "commission" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
ALTER COLUMN "operated_by" SET NOT NULL,
ALTER COLUMN "working_type" SET NOT NULL;
