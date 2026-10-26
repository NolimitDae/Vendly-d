-- Package customizations (e.g. "Style": Knotless / Miracle knots) with optional upcharges
CREATE TYPE "OptionPriceMode" AS ENUM ('FLAT', 'PER_UNIT');

CREATE TABLE "listing_option_groups" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "listing_id" TEXT NOT NULL,
    "title" VARCHAR(60) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "max_select" INTEGER NOT NULL DEFAULT 1,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "listing_option_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "listing_options" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "group_id" TEXT NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "price_mode" "OptionPriceMode" NOT NULL DEFAULT 'FLAT',
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "listing_options_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "listing_option_groups_listing_id_idx" ON "listing_option_groups"("listing_id");
CREATE INDEX "listing_options_group_id_idx" ON "listing_options"("group_id");

ALTER TABLE "listing_option_groups" ADD CONSTRAINT "listing_option_groups_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "vendor_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listing_options" ADD CONSTRAINT "listing_options_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "listing_option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The choices on a booking, frozen when it was made
ALTER TABLE "bookings" ADD COLUMN "chosen_options" JSONB,
ADD COLUMN "options_amount" DECIMAL(10,2);

-- Dos and don'ts (special instructions for using the equipment)
ALTER TABLE "vendor_listings" ADD COLUMN "dos" TEXT[],
ADD COLUMN "donts" TEXT[];
ALTER TABLE "rental_items" ADD COLUMN "dos" TEXT[],
ADD COLUMN "donts" TEXT[];
