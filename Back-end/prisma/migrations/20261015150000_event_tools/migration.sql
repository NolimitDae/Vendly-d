-- AlterTable
ALTER TABLE "events" ADD COLUMN     "client_email" VARCHAR(255),
ADD COLUMN     "client_invited_at" TIMESTAMP(3),
ADD COLUMN     "client_sees_budget" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "budget_items" ADD COLUMN     "booking_id" TEXT;

-- CreateTable
CREATE TABLE "event_timeline_items" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "event_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "title" VARCHAR(255) NOT NULL,
    "notes" TEXT,
    "location" VARCHAR(255),
    "vendor_id" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "event_timeline_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_files" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_id" TEXT NOT NULL,
    "key" VARCHAR(500) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "size" INTEGER NOT NULL,
    "mime" VARCHAR(120) NOT NULL,
    "uploaded_by" TEXT NOT NULL,

    CONSTRAINT "event_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_teams" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "planner_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "vendor_ids" TEXT[],

    CONSTRAINT "vendor_teams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_client_email_idx" ON "events"("client_email");

-- CreateIndex
CREATE UNIQUE INDEX "budget_items_booking_id_key" ON "budget_items"("booking_id");

-- CreateIndex
CREATE INDEX "event_timeline_items_event_id_starts_at_idx" ON "event_timeline_items"("event_id", "starts_at");

-- CreateIndex
CREATE INDEX "event_files_event_id_idx" ON "event_files"("event_id");

-- CreateIndex
CREATE INDEX "vendor_teams_planner_id_idx" ON "vendor_teams"("planner_id");

-- AddForeignKey
ALTER TABLE "event_timeline_items" ADD CONSTRAINT "event_timeline_items_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_timeline_items" ADD CONSTRAINT "event_timeline_items_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_files" ADD CONSTRAINT "event_files_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_files" ADD CONSTRAINT "event_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_teams" ADD CONSTRAINT "vendor_teams_planner_id_fkey" FOREIGN KEY ("planner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
