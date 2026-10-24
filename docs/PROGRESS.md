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
| B9 | Two website tabs refreshing the login at once signed the user out | The replaced refresh token keeps working for 30 seconds (rotation is atomic in Redis); tabs share one refresh through a browser lock |
| B10 | Any 401 signed the user out on the server; chat permission errors were 401 | A 401 only clears the local session; chat permission errors are 403 |
| B11 | Two problem reports at once could overwrite each other; legacy bookings had no partial-refund cap | Only the first report is kept (the second's photos are deleted); legacy bookings are capped at what was paid less refunds |
| B12 | Cancelled events could still get new vendor bookings, clients and linked bookings | Refused |
| B13 | An add-on's extra time moved the booking end on approval, before payment | Moves once, when it's paid (charge and webhook can't both apply it) |
| B14 | Working hours were checked in the customer's time zone | Hours carry the vendor's time zone; customers see times like "9am–5pm (Chicago time)" |
| B15 | Old listing photos were deleted before the update saved; receipts that failed to queue were never retried; invoice links worked for suspended accounts | Deleted after the update; the claim is released so the hourly sweep retries; suspended or deleted accounts are refused |
| B16 | Signing in on one device signed the user out everywhere else (one stored refresh token per user); the app's sign-out never ended its session on the server | Each sign-in is its own session (`sid` in its tokens, `refresh_token:<user>:<sid>` in Redis). Signing out ends only that device, switching roles renews the same session, and deleting the account ends all of them. Tokens from before this keep the old single slot until they expire |

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
| F21 | Chat safety and photos | Block / unblock and report in chat on web and app (blocking stops 1:1 messages both ways, quotes and team invites too; bookings carry on). Admin → Chat reports: context, dismiss / actioned, suspend. Photos can be sent in chat. `POST/DELETE /chat/block/:userId`, `GET /chat/blocks`, `POST /chat/report`, `/admin/chat-reports` |
| F22 | Launch fixes from the Figma review | Vendors are told about disputes and can reply (`POST /bookings/:id/dispute/reply`); same-day booking warning on requests; cancellation policy on packages; customers see how long the vendor has to answer; money given back in the app; planners edit / start / complete / cancel events; FAQ screen in the app; admin planner approvals fixed; real vendor earnings (`GET /payments/earnings`) and admin revenue; admin 2FA works |
| F23 | Security round | Two-step login on/off needs a code (server-checked). Every upload is checked by content and stored under a random name. Website login uses HttpOnly cookies through a same-site `/api` proxy with a CSRF header rule; sockets use 2-minute tokens (`GET /auth/socket-token`); the app keeps Bearer tokens |
| F24 | Money clarity | `GET /bookings/:id/cancel-preview` (same maths as cancel) before cancelling, refund card and email/push after; receipt email for every charge; final invoice PDF (`GET /bookings/:id/invoice`) emailed when the money is final; transaction history for vendors and customers (`GET /payments/transactions`) on web and app; legacy credits take commission |
| F25 | Complaints and vendor tools | Complaints with category, up to 10 private photos and the outcome asked for; vendor Refunds / Complaints tabs; vendor reviews screen with replies (`GET /reviews/my`); add-ons can add time to a booking |
| F26 | Chat, events, hours | Report a single message on the web; reported messages are kept as evidence; up to 10 photos per message; cancelled events are read-only and completed ones can't be cancelled; vendor weekly working hours shown to customers and enforced on new requests |
| F27 | Planning checklist | Rule-based (no AI) list of the services an event usually needs, by event type, guests and budget: priority, budget share, when to book, a practical tip and links to matching vendors on the date and near the venue. Public `/plan` page and app screen; planners see it on each event with what's already booked ticked off (`POST /planning/checklist`, `GET /events/:id/plan`) |
| F28 | Promo code limits | Admins can make a code "once per customer" and/or "first booking only" (two switches on the promo codes screen, also shown and changeable in the list). The booking preview, the request and `POST /promo/check` give the same answer: "You've already used this code." / "This code is for your first booking only." A request that was declined, expired or cancelled before any payment doesn't use up a once-per-customer code; a first booking means no earlier booking that was confirmed, started, completed or paid (waiting requests don't count). Checked again inside the booking transaction |
| F29 | Inspiration photos on a request | Customers can add up to 10 reference photos (JPEG/PNG/WebP/GIF, 10 MB each) when requesting a booking, on the website and in the app (`POST /bookings/with-photos`, multipart: the request as JSON plus the photos). Stored privately in `Booking.request_photos` before the booking is created and removed again if it isn't; the customer and vendor see them on the booking details, and Vendly in the dispute queue, through short-lived signed links (`/request-photos/:token`) |
| F30 | Customer bookings tabs | Active (in progress, or confirmed and its start time has come), Upcoming (confirmed, not started), Pending (waiting for the vendor) and Complete (completed, cancelled, declined and expired, each labelled), on the website and in the app. Optional `tab` filter on `GET /bookings/my/customer` (with paging; without it the list is unchanged) |
| F31 | Notification settings on the account | Booking updates, messages, payments, reminders, review requests and email switches saved on `User.notification_prefs` (null = all on), the same on the app's Notifications screen and website Settings → Notifications. The server skips opted-out pushes and emails (still kept in the inbox); security, receipts, invoices, refunds, failed payments, disputes, fee reviews and contracts are always sent (`src/common/helper/notification-prefs.ts`). In-app sound stays a phone setting and now works. `GET/PATCH /auth/notification-prefs` |

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
| R1 | `Front-End/lib/session.ts`, `lib/Fetch.ts`, `next.config.ts`, `Back-end/src/modules/auth/auth-cookies.ts` | **Done:** the website's login is in HttpOnly, SameSite=Lax cookies (Secure in production) set by the API through the website's own `/api` path (a Next.js rewrite, so they are first-party on the website's domain); JS keeps only a non-secret `vendly_logged_in` flag. Cookie-authenticated changes need `X-Requested-With: vendly-web` (CSRF). Sockets use a 2-minute token from `GET /auth/socket-token`. The app keeps Bearer tokens. Old readable `token`/`refresh_token` cookies keep working and move onto the HttpOnly cookies on the next page load. Deploy the API before the website | Closed |

## Closed

- All backend tests pass (52 suites, 554 tests) and the backend, web and mobile apps type-check with no errors.
- Stripe webhooks: `main.ts` replaced Nest's raw-body parser, so every webhook failed signature checks; fixed with `useBodyParser`. Webhook failures now return 5xx so Stripe retries, and handlers are idempotent (booking payments, deposits, subscription checkouts).
- Booking emails: the template threw for optional values; fixed.
- Payments: customers pay after Accept & Sign; duplicate payments are refunded automatically; vendor price credited once when a paid booking completes.

- `.env.example` files exist in `Back-end/`, `Front-End/` (`example.env.local`) and `Mobile/`.
- Test coverage: 50+ backend spec files exist; added specs for `PushService`, booking proofs/deliverables/push, listing pause/availability, and the deposit fix (326 backend tests, 316 passing — the 10 failures predate this work).
