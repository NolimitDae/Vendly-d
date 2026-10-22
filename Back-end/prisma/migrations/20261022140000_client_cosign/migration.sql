-- AlterEnum
ALTER TYPE "BookingContractStatus" ADD VALUE 'AWAITING_CLIENT';

-- AlterEnum
ALTER TYPE "ContractSignerRole" ADD VALUE 'CLIENT';

-- AlterTable
ALTER TABLE "booking_contracts" ADD COLUMN     "client_email" VARCHAR(255);

