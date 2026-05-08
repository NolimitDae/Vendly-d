-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('WEDDING', 'BIRTHDAY', 'CORPORATE', 'CONCERT', 'CONFERENCE', 'PRIVATE_PARTY', 'OTHER');

-- CreateTable
CREATE TABLE "event_planner_profiles" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,
    "business_name" VARCHAR(255),
    "bio" TEXT,
    "website" VARCHAR(255),
    "instagram" VARCHAR(255),
    "portfolio" TEXT[],
    "event_types" "EventType"[],
    "years_experience" INTEGER,
    "team_size" INTEGER,
    "license_photo" TEXT[],
    "license_status" "ADMIN_APPROVE_STATUS" NOT NULL DEFAULT 'PENDING',
    "approved_at" TIMESTAMP(3),

    CONSTRAINT "event_planner_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_planner_profiles_user_id_key" ON "event_planner_profiles"("user_id");

-- AddForeignKey
ALTER TABLE "event_planner_profiles" ADD CONSTRAINT "event_planner_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
