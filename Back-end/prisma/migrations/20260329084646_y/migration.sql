-- CreateEnum
CREATE TYPE "WorkingType" AS ENUM ('DAY', 'HOUR');

-- CreateEnum
CREATE TYPE "OperatedBy" AS ENUM ('REMOTE', 'ON_SITE', 'HYBRID');

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "operated_by" "OperatedBy",
    "working_type" "WorkingType",
    "category_id" TEXT NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_categories" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_sub_categories" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "category_id" TEXT NOT NULL,

    CONSTRAINT "service_sub_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_to_sub_categories" (
    "service_id" TEXT NOT NULL,
    "sub_category_id" TEXT NOT NULL,

    CONSTRAINT "service_to_sub_categories_pkey" PRIMARY KEY ("service_id","sub_category_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_name_key" ON "service_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "service_sub_categories_name_category_id_key" ON "service_sub_categories"("name", "category_id");

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_sub_categories" ADD CONSTRAINT "service_sub_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_to_sub_categories" ADD CONSTRAINT "service_to_sub_categories_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_to_sub_categories" ADD CONSTRAINT "service_to_sub_categories_sub_category_id_fkey" FOREIGN KEY ("sub_category_id") REFERENCES "service_sub_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
