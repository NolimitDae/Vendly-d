# Vendly — Issues & Risks Log

_Updated: 2026-10-08. Items marked **FIXED** were resolved in this session._

## Security

| ID | Location | Issue | Status |
|----|----------|-------|--------|
| S1 | `Back-end/src/modules/payment/stripe/StripePayment.ts` | Stripe webhook signature verified via `webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET` — correct. | OK |
| S2 | `Back-end/src/modules/subscriptions/subscriptions.service.ts:274` | `cancel()` lists last 10 Stripe sessions globally to find the subscription. With high volume this misses sessions beyond page 10. Low risk for current scale. | Low risk |
| S3 | All repo roots | No `.env.example` files. Developers must know all required env vars from memory. | Open |
| S4 | `Front-End/` | Auth token stored in cookie via `CookieHelper`. Needs to confirm `HttpOnly` + `SameSite=Strict` on the server that sets the cookie. | Needs verification |
| S5 | `Back-end/src/modules/chat/user/user.controller.ts` | `GET /chat/user` had no auth guard — exposed full user list publicly. | **FIXED** — `JwtAuthGuard` added |

## Bug Fixes Applied

| ID | Location | Issue | Fix |
|----|----------|-------|-----|
| B1 | `deposite.service.ts` | Deposit service created a new Stripe customer on every call, ignoring stored `billing_id`, orphaning customer records. | **FIXED** — only creates customer when `billing_id` is null; saves new ID back to DB |
| B2 | `stripe.controller.ts` | `payment_intent.succeeded` handler tried to find transaction by `meta.transaction_id` (never set in metadata) — balance credited but transaction record stayed `pending` forever. | **FIXED** — now matches by `reference_number` (PaymentIntent ID) |
| B3 | `subscriptions.service.ts` | `customer.subscription.updated` and `customer.subscription.deleted` webhook handlers were no-ops — vendor subscription status never synced from Stripe. | **FIXED** — both handlers now look up vendor by `billing_id`, update `subscription_active` and `payment_status` |
| B4 | `auth.service.ts` | Profile update upserted `VendorProfile` for all user types (customer, event planner, etc.), creating orphan records. | **FIXED** — guarded behind `user.type === UserType.VENDOR` |

## Features Added

| ID | Feature | Location |
|----|---------|---------|
| F1 | Listing pause endpoint | `PATCH /vendor/listings/:id/pause` — `listing.service.ts`, `listing.controller.ts` |
| F2 | Rating sort in marketplace | `marketplace.service.ts` — `sort=rating` param now sorts by avg_rating descending |
| F3 | Vendor profile fields (about_me, address) | `auth.service.ts` — `PATCH /auth/update` now writes these to `VendorProfile` for vendor users |
| F4 | Push token endpoint | `POST /auth/push-token` — saves Expo push token to `users.push_token` (new DB column via migration `20261008000000_add_push_token`) |
| F5 | Mobile push token URL | `Mobile/src/services/notifications.service.ts` — corrected from `/users/push-token` to `/auth/push-token` |

## Remaining Gaps (No Fix Applied Yet)

| ID | Location | Issue |
|----|----------|-------|
| R1 | `Back-end/src/mail/` | Booking notifications reuse the OTP email template. Dedicated HTML templates (booking confirmed, rejected, completed, cancelled) should be added for a professional experience. |
| R2 | Schema | `VendorListing.availability` is a free-text `String?` field. No structured availability calendar or date-blocking model exists. Needs schema + UI work. |
| R3 | — | Photo proof of service (upload post-job completion to confirm work done) is not in the schema or codebase. |
| R4 | — | Digital delivery (share files/links with customers as a service deliverable) is not in the schema or codebase. |
| R5 | `Back-end/src/modules/subscriptions/subscriptions.service.ts` | `cancel()` method uses a session list to find the Stripe subscription. Should store `stripe_subscription_id` on `VendorSubscriptionPlan` at checkout completion so cancellation is O(1) and reliable. |
| R6 | Mobile | Push notification deep-linking not wired — `addResponseListener` callback has a comment placeholder but no navigation. |
| R7 | Testing | Near-zero automated test coverage across backend and frontend (one test file found in Front-End: `useNotifications.test.ts`). |
