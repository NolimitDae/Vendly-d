-- Custom payment plans: a schedule the vendor proposes for one booking and the customer signs
ALTER TYPE "PaymentPlan" ADD VALUE 'CUSTOM';

-- The agreed payments of a CUSTOM plan (payments/custom-plan.ts)
ALTER TABLE "bookings" ADD COLUMN "custom_payment_plan" JSONB;
