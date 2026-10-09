-- CreateEnum
CREATE TYPE "ContractCategory" AS ENUM ('GENERAL', 'PHOTO_VIDEO', 'RENTALS', 'CATERING', 'ENTERTAINMENT', 'VENUE', 'BEAUTY');

-- CreateEnum
CREATE TYPE "ContractTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "VendorContractType" AS ENUM ('DEFAULT', 'UPLOADED');

-- CreateEnum
CREATE TYPE "VendorContractStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DISABLED');

-- CreateEnum
CREATE TYPE "BookingContractStatus" AS ENUM ('DRAFT', 'AWAITING_CUSTOMER', 'AWAITING_VENDOR', 'EXECUTED', 'VOID', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ContractSignerRole" AS ENUM ('CUSTOMER', 'PLANNER', 'VENDOR');

-- CreateEnum
CREATE TYPE "ContractAuditAction" AS ENUM ('CREATED', 'VIEWED', 'SIGNED', 'COUNTERSIGNED', 'EXECUTED', 'EMAILED', 'DOWNLOADED', 'VOIDED', 'SUPERSEDED', 'ADMIN_VIEWED', 'VERIFIED', 'VENDOR_CONTRACT_DISABLED');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "event_end_at" TIMESTAMP(3),
ADD COLUMN     "event_start_at" TIMESTAMP(3),
ADD COLUMN     "guest_count" INTEGER,
ADD COLUMN     "venue_address" VARCHAR(500);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "anonymized_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vendor_profiles" ADD COLUMN     "saved_signature_key" TEXT;

-- CreateTable
CREATE TABLE "contract_templates" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "category" "ContractCategory" NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "required_fields" TEXT[],
    "status" "ContractTemplateStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_contracts" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "type" "VendorContractType" NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "VendorContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "template_id" TEXT,
    "field_values" JSONB NOT NULL DEFAULT '{}',
    "additional_terms" TEXT,
    "file_key" TEXT,
    "file_sha256" VARCHAR(64),
    "file_name" VARCHAR(255),
    "ownership_confirmed_at" TIMESTAMP(3),
    "applies_to_all" BOOLEAN NOT NULL DEFAULT true,
    "disabled_reason" TEXT,
    "disabled_at" TIMESTAMP(3),
    "disabled_by_id" TEXT,

    CONSTRAINT "vendor_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_contract_listings" (
    "vendor_contract_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,

    CONSTRAINT "vendor_contract_listings_pkey" PRIMARY KEY ("vendor_contract_id","listing_id")
);

-- CreateTable
CREATE TABLE "booking_contracts" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "booking_id" TEXT NOT NULL,
    "vendor_contract_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "BookingContractStatus" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(255) NOT NULL,
    "rendered_body" TEXT NOT NULL,
    "merge_data" JSONB NOT NULL,
    "source_pdf_key" TEXT,
    "source_pdf_sha256" VARCHAR(64),
    "content_sha256" VARCHAR(64) NOT NULL,
    "executed_pdf_key" TEXT,
    "executed_pdf_sha256" VARCHAR(64),
    "verification_code" VARCHAR(32) NOT NULL,
    "executed_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "last_reminder_at" TIMESTAMP(3),
    "supersedes_id" TEXT,

    CONSTRAINT "booking_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_signatures" (
    "id" TEXT NOT NULL,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "booking_contract_id" TEXT NOT NULL,
    "user_id" TEXT,
    "role" "ContractSignerRole" NOT NULL,
    "legal_name" VARCHAR(255) NOT NULL,
    "signer_email" VARCHAR(255),
    "signature_image_key" TEXT,
    "consent_text_version" VARCHAR(32) NOT NULL,
    "ip_address" VARCHAR(64),
    "user_agent" TEXT,
    "app_version" VARCHAR(64),
    "device_platform" VARCHAR(64),
    "document_sha256" VARCHAR(64) NOT NULL,

    CONSTRAINT "contract_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_audit_events" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "booking_contract_id" TEXT,
    "vendor_contract_id" TEXT,
    "actor_id" TEXT,
    "actor_role" VARCHAR(32),
    "action" "ContractAuditAction" NOT NULL,
    "ip_address" VARCHAR(64),
    "user_agent" TEXT,
    "details" JSONB,

    CONSTRAINT "contract_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_templates_category_version_key" ON "contract_templates"("category", "version");

-- CreateIndex
CREATE INDEX "vendor_contracts_vendor_id_status_idx" ON "vendor_contracts"("vendor_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_contracts_vendor_id_version_key" ON "vendor_contracts"("vendor_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "booking_contracts_verification_code_key" ON "booking_contracts"("verification_code");

-- CreateIndex
CREATE UNIQUE INDEX "booking_contracts_supersedes_id_key" ON "booking_contracts"("supersedes_id");

-- CreateIndex
CREATE INDEX "booking_contracts_status_idx" ON "booking_contracts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "booking_contracts_booking_id_version_key" ON "booking_contracts"("booking_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "contract_signatures_booking_contract_id_role_key" ON "contract_signatures"("booking_contract_id", "role");

-- CreateIndex
CREATE INDEX "contract_audit_events_booking_contract_id_created_at_idx" ON "contract_audit_events"("booking_contract_id", "created_at");

-- AddForeignKey
ALTER TABLE "vendor_contracts" ADD CONSTRAINT "vendor_contracts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_contracts" ADD CONSTRAINT "vendor_contracts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "contract_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_contract_listings" ADD CONSTRAINT "vendor_contract_listings_vendor_contract_id_fkey" FOREIGN KEY ("vendor_contract_id") REFERENCES "vendor_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_contract_listings" ADD CONSTRAINT "vendor_contract_listings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "vendor_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_contracts" ADD CONSTRAINT "booking_contracts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_contracts" ADD CONSTRAINT "booking_contracts_vendor_contract_id_fkey" FOREIGN KEY ("vendor_contract_id") REFERENCES "vendor_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_contracts" ADD CONSTRAINT "booking_contracts_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "booking_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_booking_contract_id_fkey" FOREIGN KEY ("booking_contract_id") REFERENCES "booking_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_audit_events" ADD CONSTRAINT "contract_audit_events_booking_contract_id_fkey" FOREIGN KEY ("booking_contract_id") REFERENCES "booking_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_audit_events" ADD CONSTRAINT "contract_audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Write-once guarantees for legal records ----------------------------------

CREATE OR REPLACE FUNCTION contract_signatures_write_once() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'contract_signatures rows cannot be deleted';
  END IF;
  -- only allowed change: unlinking a user (ON DELETE SET NULL / anonymisation)
  IF (to_jsonb(NEW) - 'user_id') IS DISTINCT FROM (to_jsonb(OLD) - 'user_id')
     OR (NEW.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'contract_signatures rows are write-once';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contract_signatures_write_once
  BEFORE UPDATE OR DELETE ON "contract_signatures"
  FOR EACH ROW EXECUTE FUNCTION contract_signatures_write_once();

CREATE OR REPLACE FUNCTION contract_audit_events_write_once() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'contract_audit_events rows cannot be deleted';
  END IF;
  IF (to_jsonb(NEW) - 'actor_id') IS DISTINCT FROM (to_jsonb(OLD) - 'actor_id')
     OR (NEW.actor_id IS NOT NULL AND NEW.actor_id IS DISTINCT FROM OLD.actor_id) THEN
    RAISE EXCEPTION 'contract_audit_events rows are write-once';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contract_audit_events_write_once
  BEFORE UPDATE OR DELETE ON "contract_audit_events"
  FOR EACH ROW EXECUTE FUNCTION contract_audit_events_write_once();

CREATE OR REPLACE FUNCTION booking_contracts_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'booking_contracts rows cannot be deleted';
  END IF;
  IF NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
     OR NEW.rendered_body IS DISTINCT FROM OLD.rendered_body
     OR NEW.merge_data IS DISTINCT FROM OLD.merge_data
     OR NEW.source_pdf_sha256 IS DISTINCT FROM OLD.source_pdf_sha256
     OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.verification_code IS DISTINCT FROM OLD.verification_code THEN
    RAISE EXCEPTION 'booking_contracts content is immutable';
  END IF;
  IF OLD.executed_pdf_sha256 IS NOT NULL
     AND (NEW.executed_pdf_sha256 IS DISTINCT FROM OLD.executed_pdf_sha256
          OR NEW.executed_pdf_key IS DISTINCT FROM OLD.executed_pdf_key) THEN
    RAISE EXCEPTION 'executed contract PDF and hash are write-once';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER booking_contracts_guard
  BEFORE UPDATE OR DELETE ON "booking_contracts"
  FOR EACH ROW EXECUTE FUNCTION booking_contracts_guard();
