-- Indexes for the columns the app looks rows up by (bookings by customer, payments by Stripe id, reviews by vendor and listing, ...)
-- CreateIndex
CREATE INDEX "ucodes_user_id_idx" ON "ucodes"("user_id");

-- CreateIndex
CREATE INDEX "quotes_vendor_id_idx" ON "quotes"("vendor_id");

-- CreateIndex
CREATE INDEX "user_payment_methods_user_id_idx" ON "user_payment_methods"("user_id");

-- CreateIndex
CREATE INDEX "payment_transactions_user_id_type_idx" ON "payment_transactions"("user_id", "type");

-- CreateIndex
CREATE INDEX "payment_transactions_order_id_idx" ON "payment_transactions"("order_id");

-- CreateIndex
CREATE INDEX "payment_transactions_reference_number_idx" ON "payment_transactions"("reference_number");

-- CreateIndex
CREATE INDEX "vendor_listings_vendor_id_idx" ON "vendor_listings"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_listings_category_id_idx" ON "vendor_listings"("category_id");

-- CreateIndex
CREATE INDEX "listing_availability_listing_id_idx" ON "listing_availability"("listing_id");

-- CreateIndex
CREATE INDEX "bookings_customer_id_idx" ON "bookings"("customer_id");

-- CreateIndex
CREATE INDEX "bookings_listing_id_idx" ON "bookings"("listing_id");

-- CreateIndex
CREATE INDEX "booking_installments_payment_intent_id_idx" ON "booking_installments"("payment_intent_id");

-- CreateIndex
CREATE INDEX "listing_add_ons_listing_id_idx" ON "listing_add_ons"("listing_id");

-- CreateIndex
CREATE INDEX "booking_proofs_booking_id_idx" ON "booking_proofs"("booking_id");

-- CreateIndex
CREATE INDEX "booking_deliverables_booking_id_idx" ON "booking_deliverables"("booking_id");

-- CreateIndex
CREATE INDEX "reviews_vendor_id_idx" ON "reviews"("vendor_id");

-- CreateIndex
CREATE INDEX "reviews_listing_id_idx" ON "reviews"("listing_id");

-- CreateIndex
CREATE INDEX "reviews_author_id_idx" ON "reviews"("author_id");

-- CreateIndex
CREATE INDEX "events_event_planner_id_idx" ON "events"("event_planner_id");

-- CreateIndex
CREATE INDEX "budget_items_event_id_idx" ON "budget_items"("event_id");

-- CreateIndex
CREATE INDEX "event_tasks_event_id_idx" ON "event_tasks"("event_id");

-- CreateIndex
CREATE INDEX "vendor_contract_listings_vendor_contract_id_idx" ON "vendor_contract_listings"("vendor_contract_id");

-- CreateIndex
CREATE INDEX "vendor_contract_listings_listing_id_idx" ON "vendor_contract_listings"("listing_id");

