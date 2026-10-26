-- Vendors' social accounts, shown as links on their shop page
ALTER TABLE "vendor_profiles" ADD COLUMN "website" VARCHAR(255),
ADD COLUMN "instagram" VARCHAR(255),
ADD COLUMN "tiktok" VARCHAR(255),
ADD COLUMN "facebook" VARCHAR(255),
ADD COLUMN "youtube" VARCHAR(255),
ADD COLUMN "x" VARCHAR(255);
