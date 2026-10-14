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
- `POST /bookings/:id/dispute` (customer, before release) freezes the money until an admin resolves it (`dispute_resolved_at`; admin tooling is Phase C).
- An hourly cron releases due bookings: vendor share = paid installments − fee − refunds, sent as a Stripe Transfer to the vendor's Connect account; vendors without Connect get a Vendly balance credit instead (withdrawn through the existing `/withdraw` routes).
- `GET /bookings/:id/payments` returns the timeline: plan, installments with status/attempts/errors, paid/outstanding, release and dispute state.

## Cancellations and refunds

- Tiers (`booking/cancellation.ts`) decide how much comes back; `PaymentsService.refundBooking` refunds newest installment first, voids uncaptured holds and cancels unpaid installments. The vendor's kept share, if any, is credited as before.

## Still to do

- Admin dispute resolution (refund / partial refund / release) and fee settings in the database: Phase C.
- Early deposit release for vendors with recovery from future payouts.
- App screens: add-card sheet and card picker in the booking summary (mobile + web), payment timeline on booking detail, approve/dispute buttons.
- Legacy bookings paid through hosted Checkout (before this engine) keep the old path: no installments, vendor credited to balance on completion.
