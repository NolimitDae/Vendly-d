# Vendly — Issues & Risks Log

_Updated: 2026-10-08. All Build Plan Phase 0 items resolved._

## Fixed This Session

| ID | Issue | Fix |
|----|-------|-----|
| S5 | `GET /chat/user` had no auth guard — exposed full user list publicly | `JwtAuthGuard` added to `UserController` |
| B1 | Deposit service created a new Stripe customer on every call, orphaning records | Fixed: only creates customer when `billing_id` is null; persists new ID to DB |
| B2 | `payment_intent.succeeded` tried to find transaction by `meta.transaction_id` (never set) | Fixed: match by `reference_number` (PaymentIntent ID) via `updateMany` |
| B3 | `customer.subscription.updated` and `customer.subscription.deleted` were no-ops | Fixed: both handlers look up vendor by `billing_id`, sync `subscription_active` and `payment_status` |
| B4 | Profile update upserted `VendorProfile` for all user types | Fixed: guarded behind `user.type === UserType.VENDOR` |
| R5 | `cancel()` scanned last 10 Stripe sessions to find subscription (unreliable) | Fixed: `stripe_subscription_id` now stored on `VendorSubscriptionPlan` at checkout; cancellation uses it directly |

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

## Remaining Open Items

| ID | Location | Issue | Priority |
|----|----------|-------|----------|
| R1 | `Mobile/src/hooks/usePushNotifications.ts` | Push notification deep-linking not wired — `addResponseListener` has a comment placeholder but no navigation to the relevant screen | Medium |
| R2 | General | No `.env.example` files in repo roots. Developers must know required env vars from memory | Low |
| R3 | `Front-End/` | Auth token cookies need `HttpOnly` + `SameSite=Strict` verification at the server level | Medium |
| R4 | Testing | Near-zero automated test coverage (one test file found: `Front-End/hooks/useNotifications.test.ts`) | High |
| R5 | `Mobile/src/screens/` | Deliverables, proof, and availability calendar UI not yet in the mobile app | Medium |
| R6 | `Front-End/app/(Frond-End)/` | Deliverables, proof upload, and availability calendar UI not yet in the web frontend | Medium |
