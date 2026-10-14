# Vendly — step-by-step plan to finish the build

_Written 2026-10-14 for whoever picks this up next (human or model). Read `docs/BUILD_PLAN.md` for phase scope, `docs/PAYMENTS.md` for the payment engine, `CLAUDE.md` for stack and conventions. Everything below is ordered; each step ends with what "done" looks like and how to prove it._

## 0. Ground rules (from the owner, David)

- Build in **pieces and check in after each section** with plain-language summaries and screenshots saved to `C:\Users\David\vendly-redesign-previews\`. David reviews on his iPhone.
- **Never push without his explicit "push" for that batch.** `main` auto-deploys the website and backend on Railway. Mobile code does not deploy anywhere by itself.
- Commit locally after every section. Commit messages end with the attribution line the session gives you; no model names in commits, PRs or code.
- Figma layouts, **website colours** (plum, see `Mobile/src/constants/colors.ts` and `Front-End/app/globals.css`), and improve on the designs where the backend allows something better.
- Don't commit `graphify-out/`, `.playwright-mcp/`, or `~/.figma-token`.

## 1. Where things stand (2026-10-14)

| Area | State |
|---|---|
| Website | Rebranded, dark mode plum, deployed. Settings → payment methods page exists (`/settings/payment-methods`) but is **not linked** from the settings menu. |
| Mobile (Expo) | All Figma sections built in the plum brand: onboarding/auth, browse → booking, booking history, messages, settings, vendor app, planner app, saved cards + payment timeline. Verified in a browser preview against a fake API; **not yet run on a phone or against the live backend.** |
| Backend | Phase A (security/money fixes) and Phase B payment engine done and tested (619 tests). Migration `20261014120000_payment_engine` is **unapplied on Railway until pushed** (Railway runs migrations on deploy — confirm in `Back-end/Dockerfile`/start script before pushing). |
| Unpushed | Everything after commit `18b18f5`: `24f45fa` (payment engine), `8a96136` (web payment components). Ask David before pushing. |

### Tooling notes you will need

- **Figma:** the MCP tool is capped at 20 calls/month (Starter plan) and is used up. Use the REST API: token at `~/.figma-token`, helpers in `~/vendly-figma/` (`dump.js <nodeId…>` prints a frame's layout tree from cached node JSON; `dl.js`-style scripts download PNG renders to `~/vendly-figma/img/`). File key `nTJ0HtuOFRbWuwWe7tDtVq`. Sections: Customer `5512:11236`, Vendor `5442:6473`, Planner `5532:18660`. Rendered PNGs for every section already sit in `~/vendly-figma/img/`.
- **Prisma:** `DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma generate` works without a database. New migrations are written by hand into `Back-end/prisma/migrations/<timestamp>_<name>/migration.sql` (no local DB).
- **Backend tests:** `cd Back-end && npx jest` (≈10 min; run a module path for speed). Type-check: `npx tsc --noEmit -p tsconfig.json`.
- **Web tests:** `cd Front-End && npx tsc --noEmit && npx jest`.
- **Mobile:** `cd Mobile && npx tsc --noEmit`. Browser preview: `npx expo start --web --port 8081` (Stripe native module is stubbed on web via `metro.config.js`; `@react-native-community/datetimepicker` renders nothing on web). In the Playwright preview, `locator.click()` often doesn't trigger React Native Pressables; dispatch pointerdown/mousedown/pointerup/mouseup/click events on the leaf text element instead (see the `fire()` helper pattern in the previous session's history).
- **Windows quirks:** many files are CRLF; when editing with node scripts, normalise `\r\n` → `\n`, edit, and write back in the original line ending. Avoid bash heredocs containing backticks/quotes: write the script with the Write tool to `%LOCALAPPDATA%\Temp` and run `node` on it. Never use `sed -i` with multi-line patterns on these files.

## 2. Finish Phase B on the website (next, ~half a day)

Goal: a customer on the website can save a card, request a booking with it, see the payment timeline, retry a failed charge, confirm work or report a problem; vendors can choose a payment plan.

1. **Link payment methods in settings.** `Front-End/app/(Frond-End)/settings/page.tsx` has a list of cards/sections (grep `font-semibold text-gray-900 dark:text-white` near line 141). Add a "Payment methods" card linking to `/settings/payment-methods`. Done when the link renders in the settings page test (`settings/page.test.tsx` — add an assertion).
2. **Card picker in the booking request.** `Front-End/components/marketplace/BookingModal.tsx`:
   - Change `Preview.pricing` type to `{ price: number; service_fee: number; total: number; plan?: PaymentPlan; schedule?: ScheduleLine[] }` (the API now returns numbers — the old strings caused `$NaN`).
   - Render pricing with `$${n.toFixed(2)}`, then list `schedule` lines ("50% deposit — when the vendor accepts — $247.50", "Balance — Oct 26 — $225.00") under `PLAN_LABELS[plan]`.
   - In the `details` step add a "Payment method" block using `<SavedCards selected={card} onSelect={setCard} />` from `components/payments/SavedCards.tsx`. Block "Review contract" until a card is selected ("Add a card first. It is only charged once the vendor accepts.").
   - Include `payment_method_id: card` in `fields()` (type already added to `BookingFields`).
   - Update `BookingModal.test.tsx`: mock `@/service/payments/payments.service` (`cards` resolves one default card; `setupIntent` unused), change the pricing fixture to numbers, assert the formatted totals and that the request body carries `payment_method_id`.
3. **Timeline on the booking detail page.** `Front-End/app/(Frond-End)/bookings/[id]/page.tsx`: render `<PaymentTimeline bookingId bookingStatus onChanged={reload} />` above `BookingContractSection`; keep the old hosted-checkout "Pay now" block only when `!booking.payment_plan` (legacy bookings). Add `payment_plan` to the page's booking type.
4. **Vendor payment plan.** `app/(Frond-End)/vendor/listings/new/page.tsx` and `[id]/edit/page.tsx`: add a `payment_plan` select next to `price_unit` with the four options and `PLAN_LABELS` help text; send it in the form; edit page pre-fills from `l.payment_plan ?? l.effective_payment_plan`.
5. **Env:** Railway frontend needs `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. The card form shows "Card payments are not configured" until it is set — tell David to add it (test key first).
6. Run web tsc + jest, commit, screenshots of modal and detail page, check in, ask to push.

## 3. Phase C — admin money tools (~1–2 days)

Backend first, then the admin dashboard (`Front-End/app/(admin)/`). Guard everything with the existing admin guard (grep `UserType.ADMIN` usage in `Back-end/src/modules/admin`).

1. **Fee settings in the database.** New model `PlatformSetting { key @id, value Json, updated_at }` (or a single-row `PlatformFees` table): `customer_service_fee_percent`, `customer_service_fee_minimum`, `vendor_commission_percent` (default 0), per-category overrides (`ServiceCategory.fee_percent?`). Replace `appConfig().fees` reads in `booking-contracts.service.ts#serviceFee` with a cached DB lookup (fall back to env). Admin routes `GET/PATCH /admin/settings/fees`. Tests: fee resolution order (category → platform → env).
2. **Dispute queue.** `GET /admin/disputes` (bookings with `dispute_opened_at` and no `dispute_resolved_at`, with timeline), `POST /admin/disputes/:bookingId/resolve { action: 'refund' | 'partial_refund' | 'release', amount?, note }`. Refund via `PaymentsService.refundBooking`; release via `releaseBooking` after setting `dispute_resolved_at`. Email both sides. Tests for each action and for "already released".
3. **Early deposit release.** `POST /bookings/:id/release-deposit` (vendor) allowed once the deposit installment is PAID and the contract is EXECUTED: transfers `deposit − fee` now, records `Booking.early_released_amount`. On a later refund that exceeds what is still held, create a negative `PaymentTransaction` (`type: 'payout_recovery'`) and have `releaseBooking`/withdraw subtract outstanding recoveries from the vendor's next payout. Tests: release, then customer-tier refund larger than held funds → recovery row and reduced next payout.
4. **Promo codes & feature flags.** Models `PromoCode { code, percent_off | amount_off, max_uses, expires_at, min_amount }`, `FeatureFlag { key, enabled, audience }`. Apply promo in `pricingFor()` and `createSignedBooking` (store `promo_code` + `discount` on the booking; schedule uses the discounted price). Admin CRUD routes. Mobile summary already has a "Promo" slot in Figma — add the field after the backend exists.
5. **Revenue report.** `GET /admin/reports/revenue?from&to`: sums of installments paid, fees, refunds, payouts, grouped by day. Admin page with a table and CSV download.
6. **User suspend/restore.** `PATCH /admin/users/:id/status` toggling `status` (0 = suspended; the JWT strategy already rejects status 0). Admin users page gets a button.
7. Admin UI pages for each of the above in `Front-End/app/(admin)/` following the existing table/card patterns there (plum tokens, `dark:` classes).

## 4. Phase D — rentals (~2 days)

1. **Schema:** `RentalItem { vendor_id, title, description, images, category_id, daily_rate, deposit_amount, quantity, turnaround_hours, status }`, `RentalReservation { item_id, booking_id, start_date, end_date, quantity, status }`, `RentalReturn { reservation_id, photos, notes, damage_reported, late_fee, damage_fee }`.
2. **Availability:** quantity available for a date range = `quantity − Σ reservations overlapping [start − turnaround, end + turnaround]`. Pure function + tests.
3. **Reservation inside a DB transaction** (`SELECT … FOR UPDATE` via `$transaction` + `updateMany` guards, same pattern as `recordPayment`) so two customers can't over-book.
4. **Booking integration:** a rental booking is a Booking with `listing_id` null and one or more reservations; price = Σ(daily_rate × days × qty); security deposit as a separate `BookingInstallment` with `capture_manually = true` (authorized, captured only when a damage report is filed). Returns: vendor uploads return photos; damage/late fees become an extra capture or a new charge, customer can dispute (existing flow).
5. **Vendor inventory dashboard:** items, stock per date, reservations calendar. Mobile vendor screens follow the Figma "Rentals" frames in `~/vendly-figma/img` (vendor section has "Add On"/rental variants; download more with the REST helper).
6. **Customer rental flow (mobile + web):** browse rentals category → item → pick dates and quantity → booking summary (reuse `BookingSummary` with a `rental` branch).

## 5. Phase E — planner tools and chat (~3 days)

1. **Event group chat:** `Conversation.event_id`, auto-created when an event gets its first booking; members = planner + each booked vendor (+ client). Reuse the chat module and Socket.IO gateway; messages carry `conversation_id` as today.
2. **Read receipts & pinned messages:** `MessageRead { message_id, user_id, read_at }`, `Conversation.pinned_message_id`. Emit via the gateway.
3. **Custom quote cards:** `Quote { conversation_id, vendor_id, listing_id?, amount, description, expires_at, status }`; accepting a quote creates a booking request pre-filled with that amount (contract preview handles the rest).
4. **Contact-sharing warning:** regex for phone/email in outgoing messages → non-blocking warning in the apps ("Keep it in Vendly to stay protected").
5. **Run of show & shared files:** `EventTimelineItem { event_id, time, title, vendor_id?, notes }`, `EventFile { event_id, key, name, uploaded_by }` (TanvirStorage). Figma "Milestones" frames (`5532:19159`, `20825`, `20944`) map onto timeline items with a "Find Vendor" button that opens `FindVendors { eventId }` (already wired in the app).
6. **Budget from real bookings:** `BudgetItem.booking_id` link; event budget summary sums booking amounts automatically.
7. **Client read-only view:** `Event.client_id`, a `CLIENT` user sees the event (timeline, vendors, files) without edit rights; the Figma "Review & Approval/Customer" and "Approved Payment" frames describe the client approving the planner's quote (ties to quotes above).
8. **Saved vendor teams:** `VendorTeam { planner_id, name, vendor_ids[] }`, "Invite team" from an event.
9. Mobile planner screens for milestones, invitations and groups: Figma frames are listed in `~/vendly-figma/planner-flow-depth1.json`.

## 6. Phase F — mobile leftovers (~2 days)

1. **Google and Apple sign-in:** backend already has `/auth/google` and `/auth/facebook` redirect flows; add `expo-auth-session` (Google) and `expo-apple-authentication`, exchange the id token at a new `POST /auth/social { provider, id_token }` that creates/links the user and returns the same `authorization` payload as login. Replace the "Coming soon" alerts in `screens/auth/SignIn.tsx`.
2. **Forgot / reset password:** screens exist in Figma (`5512:11936`, `11971`, `11864`, `11905`); backend routes `forgot-password`, `verify-token`, `reset-password` exist. Add `ForgotPassword` and `ResetPassword` screens to the auth stack and a link on Sign in.
3. **Choose location:** `5512:11673`/`11722`; store on the user (`address`) and prefill the Find Vendors location filter.
4. **Multi-role accounts:** needs backend (`User.roles[]` or a role switch endpoint) — design before building; Figma's "User Selection" in settings is this.
5. **Vendor business name editing:** add `business_name` to `UpdateUserDto` and the update path (currently ignored).
6. **Licence upload screen** for vendors (`POST /auth/add-license`, Figma `5442:8111`–`8345`).
7. **Explore filters** (date, price, rating, distance): backend `listings` already filters by price and sub-category; add date (exclude listings blocked on that date) and sort by rating; distance needs lat/lng on listings — add `VendorListing.lat/lng` and geocode on save.
8. **Native Payment Sheet** for the legacy pay-now fallback, in-app camera for proof with GPS/time stamp (`expo-camera`, `expo-location`), notifications screen backed by the `Notification` model, skeleton loaders, haptics.
9. **Device run:** `npx expo run:ios` / EAS dev build (Stripe and signature canvas need a dev build, not Expo Go). Test sign-up → booking → accept → charge against the Railway backend with Stripe test keys.

## 7. Phase G — operations (~half a day)

1. Sentry: `@sentry/nestjs` on the backend (wrap the webhook and cron jobs), `@sentry/nextjs` on the website, `sentry-expo` on mobile.
2. Analytics events (PostHog or Amplitude): signup, booking_requested, booking_accepted, payment_succeeded/failed, release, dispute.
3. EAS Update channel + `eas.json` build profiles; EAS Submit config for App Store / Play.
4. Railway: confirm `prisma migrate deploy` runs on backend deploy; set `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; register the webhook URL for `payment_intent.*` and `checkout.session.completed` events.

## 8. Loose ends to tell David about

- Rotate the Figma token he pasted in chat; put the new one in `~/.figma-token`.
- Legal text still says "Vendly service fee" in contract templates and the Terms page; it should read "Vendly Protection fee" and go past a lawyer.
- `payment_intent.*` webhook events must be enabled in the Stripe dashboard for installment reconciliation to work.
- Legacy bookings paid through hosted Checkout before the payment engine keep the old immediate-credit path; new bookings use the hold-and-release rules.
