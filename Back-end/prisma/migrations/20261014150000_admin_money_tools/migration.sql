-- AlterTable
ALTER TABLE "service_categories" ADD COLUMN     "fee_percent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "dispute_resolution" TEXT,
ADD COLUMN     "early_released_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "commission_amount" DECIMAL(10,2),
ADD COLUMN     "promo_code" VARCHAR(50),
ADD COLUMN     "discount" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255),
    "percent_off" DECIMAL(5,2),
    "amount_off" DECIMAL(10,2),
    "min_amount" DECIMAL(10,2),
    "max_uses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" VARCHAR(255),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);
