-- AlterTable
ALTER TABLE "vendor_profiles" ADD COLUMN     "banner" TEXT,
ADD COLUMN     "handle" VARCHAR(30),
ADD COLUMN     "logo" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "vendor_profiles_handle_key" ON "vendor_profiles"("handle");
