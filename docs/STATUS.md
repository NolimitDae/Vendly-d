# Vendly Feature Status

_Last updated: 2026-10-08 (post Phase 0 fixes)_

| Feature | Status | Key Files | Notes |
|---------|--------|-----------|-------|
| **Authentication** | Done | `Back-end/src/modules/auth/` | JWT + refresh, local + Google/Facebook strategies, OTP email verification, 2FA |
| **User registration / profiles** | Done | `auth.service.ts`, `auth.controller.ts` | Separate customer & vendor profile creation; avatar upload |
| **Vendor profile** | Done | `auth.service.ts`, `prisma/schema.prisma:VendorProfile` | business_name, about_me, address, license_photo all writable via `PATCH /auth/update`; vendor-only guard added |
| **Marketplace / discovery** | Done | `Back-end/src/modules/marketplace/`, `Front-End/app/(Frond-End)/marketplace/` | Listing browse + search, full-text, filters, sort (price/newest/rating) |
| **Vendor listings (CRUD)** | Done | `Back-end/src/modules/vendor/listing/` | Create, read, update, publish, pause, delete (soft) |
| **Search & filters** | Done | `marketplace.service.ts` | q, category, sub_category, location, min/max price, sort by price/newest/rating |
| **Booking flow** | Done | `Back-end/src/modules/booking/`, `Front-End/app/(Frond-End)/bookings/` | Full PENDING→CONFIRMED→IN_PROGRESS→COMPLETED with confirm/reject/start/complete/cancel |
| **Booking payment (checkout)** | Done | `booking.controller.ts`, `stripe.controller.ts` | Stripe Checkout session for booking; webhook confirms on `checkout.session.completed` |
| **Booking deposit** | Done | `Back-end/src/modules/payment/deposite/` | Stripe PaymentIntent; Stripe customer created once and reused (billing_id) |
| **Stripe subscriptions (vendor)** | Done | `Back-end/src/modules/subscriptions/` | Plans Free Trial→Premium; webhook handlers for checkout, updated, deleted — all active |
| **Stripe Connect (vendor payouts)** | Done | `Back-end/src/modules/payment/withdraw/` | Create Express account, onboarding link, process withdrawal, balance check |
| **Wallet / balance** | Done | `Back-end/src/modules/payment/`, `Front-End/app/(Frond-End)/wallet/` | Deposit (Stripe Elements) → webhook increments balance; withdraw via Connect |
| **In-app chat** | Done | `Back-end/src/modules/chat/`, `Front-End/app/(Frond-End)/chat/` | Real-time Socket.IO; conversation list; message history; typing indicators; WebRTC signalling |
| **Push notifications (mobile)** | Done | `Mobile/src/hooks/usePushNotifications.ts`, `auth.controller.ts POST /auth/push-token` | Expo push token saved to DB; `POST /auth/push-token` endpoint added |
| **In-app notifications** | Done | `Back-end/src/modules/application/notification/`, `Front-End/hooks/useNotifications.ts` | Redis-backed WebSocket gateway; mark read/all-read/delete |
| **Reviews & ratings** | Done | `Back-end/src/modules/review/` | Create (post-COMPLETED booking), vendor reply, paginated listing/vendor view with avg + distribution |
| **Saved listings** | Done | `Back-end/src/modules/saved-listings/`, `Front-End/app/(Frond-End)/saved-listings/` | Save/unsave, list all with full data, list IDs for heart-state pre-fill |
| **Event planner profile** | Done | `Back-end/src/modules/event-planner/` | Profile upsert (portfolio + license), public directory, admin approval workflow |
| **Events management** | Done | `Back-end/src/modules/events/` | Full CRUD; budget items; tasks; link bookings to events |
| **Contact us** | Done | `Back-end/src/modules/application/contact/`, `Front-End/app/(Frond-End)/contact-us/` | Rate-limited form submission |
| **FAQ** | Done | `Back-end/src/modules/application/faq/` | CRUD via admin; public read |
| **Admin dashboard** | Done | `Back-end/src/modules/admin/`, `Front-End/app/(admin)/` | Bookings, vendors, transactions, categories, settings, event-planner approvals |
| **Mobile app (Expo)** | Partial | `Mobile/src/screens/` | Customer (home, listings, bookings, chat, profile), vendor (dashboard, listings, bookings), event planner screens all present; push notifications wired |
| **Rental inventory / availability calendar** | Missing | `VendorListing.availability` (String? — free text) | Schema has a single string field; no structured date-blocking or calendar UI |
| **Photo proof of service** | Missing | — | Not found in codebase or schema |
| **Digital delivery (files/links)** | Missing | — | Not found in codebase or schema |
| **Booking email templates** | Partial | `Back-end/src/mail/` | Email fires on booking events but reuses the OTP template — no dedicated booking HTML templates |
