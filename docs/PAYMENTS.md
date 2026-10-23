# Payments engine (Phase B)

_How money moves through Vendly from the Oct 2026 build. Code lives in `Back-end/src/modules/payments/`._

## The customer's card

- Customers save a card once: `POST /payments/setup-intent` returns a Stripe SetupIntent client secret for the Stripe card form; the card is stored on the customer's Stripe profile (`User.billing_id`).
- `GET /payments/methods`, `PATCH /payments/methods/:id/default`, `DELETE /payments/methods/:id` (refused while an active booking uses the card).
- A booking request carries `payment_method_id` (the chosen saved card). Nothing is charged at request time.

## Payment plans

Vendors pick a plan per package (`VendorListing.payment_plan`); admins can set a category default (`ServiceCategory.default_payment_plan`); otherwise **full on accept**. The marketplace returns `effective_payment_plan` on every listing.

| Plan | What happens |
|---|---|
| `FULL_ON_ACCEPT` | Price + Vendly Protection fee charged when the vendor accepts. |
| `DEPOSIT_50` | 50% + fee on accept; balance 7 days before the event. |
| `DEPOSIT_25` | 25% + fee on accept; balance 14 days before the event. |
| `PAY_AFTER_SERVICE` | Card authorized (not captured) when the event starts; captured when the vendor marks the job complete. |

Rules in `payment-schedule.ts` (unit-tested): the fee always rides on the first charge; a balance that would already be overdue (event sooner than the lead time) is merged into the first charge; deposit plans without an event date fall back to full on accept.

## Charging

- When the vendor accepts (`confirm`), the plan is snapshotted into `booking_installments` and anything due now is charged off-session (`PaymentsService.chargeInstallment`). Funds stay on the platform balance under `transfer_group: booking_<id>`.
- A cron every 10 minutes charges installments as they fall due and retries failures.
- Retry policy: 3 attempts, 24h apart. Each failure emails and pushes the customer. After the third failure (or a bank that insists on 3-D Secure) the installment is `FAILED` and the customer retries from the app: `POST /bookings/:id/installments/:iid/retry` with an optional new `payment_method_id` (resets the attempt counter).
- `Booking.paid_at` is set on the first successful charge, so vendors can start work once the deposit is in.
- Stripe webhooks (`payment_intent.succeeded / payment_failed / canceled / amount_capturable_updated`) reconcile installments by `metadata.installment_id`, so a timed-out API call never leaves a paid installment unrecorded.

## Holding and releasing

- On completion the vendor is **not** paid immediately. `release_at` = completion + 3 days, or 48h after the last proof upload if sooner.
- `POST /bookings/:id/approve` (customer) releases immediately.
- `POST /bookings/:id/dispute` (customer, before release) freezes the money until an admin resolves it (`dispute_resolved_at`; resolved from Admin → Disputes, below).
- An hourly cron releases due bookings: vendor share = paid installments − fee − refunds, sent as a Stripe Transfer to the vendor's Connect account; vendors without Connect get a Vendly balance credit instead (withdrawn through the existing `/withdraw` routes).
- `GET /bookings/:id/payments` returns the timeline: plan, installments with status/attempts/errors, paid/outstanding, release and dispute state.

## Cancellations and refunds

- Tiers (`booking/cancellation.ts`) decide how much the vendor is owed; `PaymentsService.refundBooking` refunds newest installment first, voids uncaptured holds and cancels unpaid installments.
- On a payment plan the settlement is made against what was **actually paid** (`settleAgainstPaid`): a vendor cancelling refunds everything paid, Vendly Protection fee included; a customer cancelling leaves the vendor the smaller of what the policy owes them and what the customer paid towards the vendor price, and refunds the rest of that (the fee stays paid, `keepFees`). Unpaid installments are never charged. Add-ons approved after booking count as price under the policy; approved fees are the vendor's in full.
- Every cancellation releases card holds (pay-after-service, rental deposits) and cancels add-on/fee requests still waiting (`voidOpenCharges`).
- Partial dispute refunds come out of the vendor's part (the fee goes back only with a full refund).
- Payout maths: vendor share = Σ max(0, amount − fee − refunded) over paid installments, so an installment refunded past the vendor part (fee included) never reduces another one.
- Charges, captures, refunds and payouts on one booking take a Postgres advisory lock (`withBookingLock`), so they never act on the same installments at once. A charge is only claimed at the amount it read, so a lowered balance is never charged at its old price.

## Add-ons, fees and money back

- **Per person / hour / day packages** (`add-ons/pricing.ts`): price × guests (minimum/maximum enforced), × event hours in half hours (minimum charged, end time required), × days spanned. `VendorListing.min_quantity / max_quantity`.
- **Library** (`/vendor/add-ons`): `VendorAddOn` rows of kind `ADD_ON` or `FEE`, priced once / per person / per hour / each. Bulk attach to packages (`ListingAddOn`); custom add-ons (`in_library = false`) belong to one package and are deleted when removed from it. Up to 40 per package.
- **At booking:** customers pick a package's add-ons; they are priced into `Booking.amount` (promo applies to the total) and stored as `BookingExtra` rows with status `INCLUDED`. The contract gets a **Schedule A** with how the price was reached, the add-ons, and the package's fees, stating that any fee or later add-on needs the customer's approval. Amendments carry Schedule A over.
- **After booking** (`BookingExtrasService`): the vendor sends an add-on (from confirmation) or a fee (from the start of the job until 14 days after completion), with a reason. The customer approves (charged on the booking card or another saved card as an installment of `kind = extra`; Vendly Protection % on add-ons, none on fees) or declines with a reason. One reminder after 24 h. A declined fee, or one unanswered for 72 h, can be sent to Vendly review: Admin → Fee reviews charges or waives it with a note; both sides are told. Up to 10 open requests and $25,000 per request.
- **Extras paid after the payout** are paid out on their own at the booking's commission rate (`payOutLateInstallments`, hourly, and straight after a payment). `BookingInstallment.paid_out_at` records what has been paid out.
- **Give money back** (`POST /bookings/:id/give-back`, vendor): first lowers what the customer still owes (scheduled or failed charges, uncaptured pay-after-service holds — the hold is then captured for the lower amount), then refunds the vendor's part of what was paid. The Vendly Protection fee is unchanged. If the vendor was already paid for that money, it is taken back from their balance less the commission Vendly took on it (`Booking.released_gross` holds the commission base). Shown to the customer as `given_back` on `/bookings/:id/payments`.

## Admin tools (Phase C)

- **Fees live in the database** (`platform_settings`), edited at Admin → Settings: Vendly Protection fee %, minimum fee, vendor commission %, currency/limits. Per-category fee overrides (`ServiceCategory.fee_percent`). Cached in memory (`currentFees()`) and refreshed on every change; env values are the fallback. The old JSON-file settings store (wiped on each Railway deploy) is gone.
- **Vendor commission** is taken from the vendor share at release and recorded as `vendly_commission` (default 0%).
- **Disputes:** Admin → Disputes lists open disputes with the customer's report and what is held; decide release / partial refund / full refund with a note. Both sides are emailed. A full refund claws back any early-released deposit.
- **Early deposit release:** `POST /bookings/:id/release-deposit` (vendor, deposit plans, contract executed, Stripe Connect set up). Subtracted from the final payout; if the booking is later refunded or cancelled, the vendor's Vendly balance goes negative and is recovered from the next payouts first.
- **Promo codes:** Admin → Promo codes. Percent or fixed amount off the vendor price, optional minimum, max uses and expiry. Customers enter a code on the booking request (web modal and mobile summary); the preview shows the discount and the code is redeemed atomically when the booking is created. `POST /promo/check` validates a code.
- **Feature flags:** Admin → Settings. `GET /flags` (public) returns enabled keys.
- **Revenue report:** Admin → Revenue: collected, Vendly fees, commission, refunds and payouts by day, with CSV export.
- **Suspend / restore:** Admin → Vendors, `PATCH /admin/users/:id/status`. Suspended users are rejected on their next request.

## Rentals (Phase D)

- Rental bookings (`POST /rentals/book`) have no package: `listing_id` is null and the booking holds one `RentalReservation` per item. Price = daily rate × days × quantity, charged in full when the vendor accepts (the usual engine). The Vendly Protection fee uses the first item's category.
- **Security deposit:** Σ(deposit per unit × quantity) is stored on `Booking.security_deposit` and scheduled as an installment with `kind = security_deposit`, `capture_manually = true`, due the day before pickup. Completion never captures it.
- **Return** (`POST /rentals/bookings/:id/return`, vendor): no fees voids the hold; damage / late fees are captured from the hold (partial capture) and anything above it is charged as a `kind = extra` installment. Fees need photos or a note; the customer gets 48h to dispute before payout.
- Payouts wait until every reservation on the booking is returned.
- Card holds lapse after about 7 days, so a deposit on a rental longer than ~6 days may expire before the return. If capture fails the fees are charged to the saved card instead (and can fail like any charge).

## What people see about their money

- **Cancel preview:** `GET /bookings/:id/cancel-preview` (customer or vendor) returns what cancelling now would do: `{ cancelled_by, refund_total, refund_fee, fee_kept, vendor_keeps, policy: {key,label,text}|null, percent, unpaid_cancelled, holds_released, card, refund_timing, message }`. It runs the same `BookingService.cancellationTerms` as the real cancel (which returns the same shape as `refund_summary`), so the two never differ. `message` is a plain sentence for whoever asked ("You'll get $225.00 back to your card. The $22.50 Vendly Protection fee isn't refunded.").
- **After a cancellation** the customer always gets an email and push with the refund amount, the card and "5–10 business days", whoever cancelled; the vendor is told when the customer cancels. `GET /bookings/:id/payments` carries `refunded`, `refund_card`, `refund_timing` and `invoice_available` for the Refund card on the booking.
- **Receipts:** every installment that becomes `PAID` (deposit, balance, pay-after capture, add-on or fee, rental deposit kept) emails the customer a receipt once (`BookingInstallment.receipt_sent_at`, claimed first; a mail failure never touches the payment). An hourly sweep sends receipts missed in the last 7 days.
- **Final invoice:** `GET /bookings/:id/invoice` (customer, vendor or admin) returns a PDF: package (from Schedule A), add-ons at booking and later, promo, fees, Vendly Protection fee, every charge with status, refunds, money given back and the total paid; the vendor's and admin's copy add the payout and commission. `GET /bookings/:id/invoice/link` returns a five-minute signed link (`/api/invoices/:token`) the mobile app opens without a login header. The customer is emailed once (`Booking.invoice_sent_at`) when the money is final: the vendor is paid out, or a paid booking's cancellation is settled (and by the hourly sweep).
- **Transaction history:** `GET /payments/transactions?type=all|payment|refund|payout|fee&from&to&q&page&limit&role=customer|vendor`. Customers: charges (−) and refunds (+) from installments, plus refunds of Checkout-era bookings. Vendors: their part of each customer payment (pending until released), refunds of it, payouts, balance credits, early deposits, withdrawals, commission, money given back and recoveries. `q` searches the booking title. Transactions created from now on carry the booking in `order_id`.
- **Checkout-era bookings** paid after completion are credited to the vendor balance less the current Vendly commission (recorded as `vendly_commission`, with `commission_amount` / `released_gross` / `released_at` set), like a regular payout. Credits made before this change are untouched.

## Still to do

- A customer cancelling a pay-after-service booking whose card is only held (not captured) owes nothing: the hold is released rather than captured for the vendor's policy share.

- Legacy bookings paid through hosted Checkout before this engine keep the old path: no installments, vendor credited to balance (less commission) on completion.
- Amendments that change the price use the platform fee rate, not the category override.
