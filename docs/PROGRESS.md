# Vendly — Issues & Risks Log

_Updated: 2026-10-23. All Build Plan Phase 0 items resolved._

## Fixed This Session

| ID | Issue | Fix |
|----|-------|-----|
| S5 | `GET /chat/user` had no auth guard — exposed full user list publicly | `JwtAuthGuard` added to `UserController` |
| B1 | Deposit service created a new Stripe customer on every call, orphaning records | Fixed: only creates customer when `billing_id` is null; persists new ID to DB |
| B2 | `payment_intent.succeeded` tried to find transaction by `meta.transaction_id` (never set) | Fixed: match by `reference_number` (PaymentIntent ID) via `updateMany` |
| B3 | `customer.subscription.updated` and `customer.subscription.deleted` were no-ops | Fixed: both handlers look up vendor by `billing_id`, sync `subscription_active` and `payment_status` |
| B4 | Profile update upserted `VendorProfile` for all user types | Fixed: guarded behind `user.type === UserType.VENDOR` |
| B5 | `cancel()` scanned last 10 Stripe sessions to find subscription (unreliable) | Fixed: `stripe_subscription_id` now stored on `VendorSubscriptionPlan` at checkout; cancellation uses it directly |
| B6 | Web "unblock dates" called a non-existent route | Fixed: `DELETE /vendor/listings/availability/:blockId` |
| B7 | Mobile sent deliverable `links` as an array; backend only parsed a JSON string | Backend accepts both |
| S6 | Deliverable links rendered as `href` / `Linking.openURL` allowed `javascript:` URLs (stored XSS) | Backend keeps only `http(s)://` links |
| B8 | A failed proofs/deliverables/availability request blanked the whole booking or listing page | Secondary requests are now non-fatal (web + mobile) |

## Features Added

| ID | Feature | Endpoints |
|----|---------|-----------|
| F1 | Listing pause | `PATCH /vendor/listings/:id/pause` |
| F2 | Rating sort | `GET /marketplace/listings?sort=rating` |
| F3 | Vendor profile about_me + address | `PATCH /auth/update` (vendor users only) |
| F4 | Push token storage | `POST /auth/push-token`; `User.push_token` column + migration |
| F5 | Availability calendar | `POST/DELETE /vendor/listings/:id/availability`, `GET /marketplace/listings/:id/availability` |
| F6 | Photo proof of service | `POST/GET /bookings/:id/proof` (up to 10 photos) |
| F7 | Digital delivery | `POST/GET /bookings/:id/deliverables` (files + links) |
| F8 | Branded booking emails | `booking-notification.ejs` — status badge, service details, CTA button |
| F9 | Push notifications | `PushService` sends via Expo on booking create/confirm/reject/start/complete/cancel and new deliverables; mobile taps open the booking detail |
| F10 | Web + mobile UI | Booking detail pages (proof upload, deliverables), unavailable dates on listing pages, block/unblock dates on vendor listing edit |
| F11 | Package categories, location and travel radius | 13 starter categories / 63 sub-categories (seed migration); searchable picker on web + app; address suggestions and "use my location" (`GET /geo/suggest`, `GET /geo/reverse`, city-level only); `service_radius_miles` on packages, and near me also finds vendors who travel that far. Listing positions are never sent out publicly |
| F12 | Get-set-up checklist per role | `GET /onboarding`, `POST /onboarding/seen`; `User.onboarding_seen`. Customer: email, ID, card, photo, city. Vendor: email, licence, ID, first package, payouts, contract, shop branding. Planner: email, profile, licence, ID, card, first event. Lives at the top of notifications (web + app) with a welcome popup and an all-set popup; gone once finished |
| F13 | Role switch without restarting the app | Navigation resets to the new role's tabs; the account refreshes when the app returns to the foreground |
| F14 | Rating prompts | Two days after a booking completes the customer gets one push + email; a "How was it?" card on the app home screens, the website bookings page and the planner dashboard. `GET /reviews/pending`, `POST /reviews/pending/:id/dismiss` |
| F15 | Booking requests expire | Vendors are reminded a day before; requests not answered within 72 h (or by the event start) are declined automatically, contracts voided, both sides told; accepting is refused once closed. Vendors see "Closes in X hours" |
| F16 | Chat read receipts + typing | "Seen" under your latest message, "<name> is typing…", live on web and app; participant checks on the server |
| F17 | Admin: dispute contract, categories | Disputes show the booking's contract, signatures and audit log; admins rename/add/delete categories and sub-categories |
| F18 | Website profile | Settings → Profile: photo, name, city |
| F19 | Calendar sync | Vendors get a private calendar link (Google/Apple subscribe to their Vendly bookings) and can import their own calendar's busy times, re-synced hourly; busy and blocked days are greyed out for customers and refused by the server |
| F20 | Catering pricing, add-ons and fees | Per person / hour / day packages charge for every guest, hour or day with minimums and maximums. Vendors keep an add-ons and fees library (Dashboard → Add-ons / Fees), bulk add them to packages or make custom ones in the package form. Customers pick add-ons when booking (priced in, listed on the contract with the package's fees). After booking, vendors send add-ons and fees for approval; approved ones are charged, declined fees can go to Vendly review (Admin → Fee reviews). Vendors can give money back. `/vendor/add-ons`, `/bookings/:id/extras`, `/booking-extras/:id/*`, `/bookings/:id/give-back`, `/admin/booking-extras` |

## Contracts (docs/CONTRACTS.md)

Built: data model with DB-enforced write-once signatures/audit log, Vendly default templates (all clauses marked [LAWYER REVIEW]), vendor default or uploaded-PDF contracts with versioning, customer signs at request, vendor Accept & Sign executes, signed PDF with signature certificate and SHA-256 (verify by upload or code), amendments, planner list + zip, admin templates/audit/disable, reminders and notifications, account deletion that keeps executed contracts. Web and mobile UI. Tests: `yarn test` (unit) and `yarn test:e2e:contracts` (needs a disposable Postgres + Redis).

| ID | Gap | Why |
|----|-----|-----|
| C1 | Deposit charged on Accept & Sign | Done: Accept & Sign schedules the payment plan and charges what's due on the saved card |
| C2 | Request expiry voiding contracts | Done: unanswered requests close after 72 hours and their contracts are voided |
| C3 | Custom quotes in chat generating contracts | Done: booking with a quote puts the quoted price in the contract and claims the quote |
| C4 | Dispute queue showing the contract | Done: each dispute has "View contract" (signatures, text, audit log, signed PDF) |
| C5 | Client co-signature | Built behind the `client_cosign` flag (off by default): the planner's client signs before the vendor (status AWAITING_CLIENT) |
| C6 | Privacy policy wording | Add "Signed contracts are kept for 7 years" to the privacy policy (admin dashboard > Privacy) |
| C7 | Lawyer review | Remove [LAWYER REVIEW] by publishing new template versions once approved |

## Remaining Open Items

| ID | Location | Issue | Priority |
|----|----------|-------|----------|
| R1 | `Front-End/helper/cookie.helper.ts` | Auth token cookie is `Secure` (prod) + `SameSite=Lax` but not `HttpOnly`, because the client reads it to build `Authorization` headers. Making it HttpOnly needs server-set cookies and `credentials: include` on every request. Accepted for now; XSS hardening (S6) reduces exposure | Medium |

## Closed

- All backend tests pass (52 suites, 554 tests) and the backend, web and mobile apps type-check with no errors.
- Stripe webhooks: `main.ts` replaced Nest's raw-body parser, so every webhook failed signature checks; fixed with `useBodyParser`. Webhook failures now return 5xx so Stripe retries, and handlers are idempotent (booking payments, deposits, subscription checkouts).
- Booking emails: the template threw for optional values; fixed.
- Payments: customers pay after Accept & Sign; duplicate payments are refunded automatically; vendor price credited once when a paid booking completes.

- `.env.example` files exist in `Back-end/`, `Front-End/` (`example.env.local`) and `Mobile/`.
- Test coverage: 50+ backend spec files exist; added specs for `PushService`, booking proofs/deliverables/push, listing pause/availability, and the deposit fix (326 backend tests, 316 passing — the 10 failures predate this work).
