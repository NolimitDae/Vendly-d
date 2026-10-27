-- Bank payments (ACH) on large bookings: which kind of payment method the booking uses, and per
-- installment what the last charge used and since when a bank payment has been clearing
ALTER TABLE "bookings" ADD COLUMN "payment_method_type" VARCHAR(30);
ALTER TABLE "booking_installments" ADD COLUMN "payment_method_type" VARCHAR(30);
ALTER TABLE "booking_installments" ADD COLUMN "clearing_since" TIMESTAMP(3);
