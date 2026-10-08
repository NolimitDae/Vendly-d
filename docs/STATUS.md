# Vendly Feature Status

_Last updated: 2026-10-08 (Build Plan Phase 0 complete)_

| Feature | Status | Key Files | Notes |
|---------|--------|-----------|-------|
| **Authentication** | Done | `Back-end/src/modules/auth/` | JWT + refresh, OTP email verification, Google/Facebook OAuth, 2FA |
| **User profiles** | Done | `auth.service.ts` | Name, avatar, address, bio writable; vendor-specific fields gated |
| **Vendor profile** | Done | `auth.service.ts`, `VendorProfile` | business_name, about_me, address, license_photo; only updates for VENDOR user type |
| **Marketplace / discovery** | Done | `src/modules/marketplace/`, `Front-End/…/marketplace/` | Search, full-text, filters, sort by price/newest/rating |
| **Vendor listings (CRUD)** | Done | `src/modules/vendor/listing/` | Create, read, update, publish, pause, delete (soft) |
| **Listing availability calendar** | Done | `listing.service.ts`, `ListingAvailability` schema | Block/unblock date ranges; public read via `GET /marketplace/listings/:id/availability` |
| **Search & filters** | Done | `marketplace.service.ts` | q, category, sub_category, location, min/max price, sort (price/newest/rating) |
| **Booking flow** | Done | `src/modules/booking/`, `Front-End/…/bookings/` | Full state machine: PENDING→CONFIRMED→IN_PROGRESS→COMPLETED; confirm/reject/start/complete/cancel |
| **Booking payment** | Done | `booking.controller.ts`, `stripe.controller.ts` | Stripe Checkout; webhook confirms on `checkout.session.completed` |
| **Booking deposit (wallet top-up)** | Done | `src/modules/payment/deposite/` | Stripe PaymentIntent; customer reuse fixed; balance increments on webhook |
| **Photo proof of service** | Done | `booking.service.ts`, `BookingProof` schema | Vendor/customer uploads photos post-booking; stored under `proofs/` |
| **Digital delivery** | Done | `booking.service.ts`, `BookingDeliverable` schema | Vendor sends files + links to customer; stored under `deliverables/` |
| **Stripe subscriptions (vendor)** | Done | `src/modules/subscriptions/` | Plans Free Trial→Premium; checkout + updated + deleted webhooks all active; stripe_subscription_id stored |
| **Stripe Connect (vendor payouts)** | Done | `src/modules/payment/withdraw/` | Create Express account, onboarding link, process withdrawal, balance check |
| **Wallet / balance** | Done | `src/modules/payment/`, `Front-End/…/wallet/` | Deposit + withdrawal flow complete |
| **In-app chat** | Done | `src/modules/chat/`, `Front-End/…/chat/` | Real-time Socket.IO; sidebar; typing indicators; WebRTC signalling |
| **Push notifications (mobile)** | Done | `Mobile/src/hooks/usePushNotifications.ts`, `POST /auth/push-token` | Expo token saved to DB; `push_token` column added |
| **In-app notifications** | Done | `src/modules/application/notification/` | Redis-backed WebSocket gateway; mark read/delete |
| **Reviews & ratings** | Done | `src/modules/review/` | Post-COMPLETED; vendor reply; avg + distribution aggregates |
| **Saved listings** | Done | `src/modules/saved-listings/` | Save/unsave; list with full data; list IDs for heart-state |
| **Event planner profile** | Done | `src/modules/event-planner/` | Portfolio + license upload; public directory; admin approval |
| **Events management** | Done | `src/modules/events/` | CRUD; budget items; tasks; link bookings to events |
| **Contact us** | Done | `src/modules/application/contact/` | Rate-limited form |
| **FAQ** | Done | `src/modules/application/faq/` | Admin CRUD; public read |
| **Admin dashboard** | Done | `src/modules/admin/`, `Front-End/…/(admin)/` | Bookings, vendors, transactions, categories, settings |
| **Mobile app (Expo)** | Partial | `Mobile/src/screens/` | Customer, vendor, event planner screens; push notifications wired; deep-link navigation placeholder |
| **Booking email templates** | Done | `src/mail/templates/booking-notification.ejs` | Branded HTML email for new booking, confirmed, rejected, completed, cancelled |
| **Rental inventory (date blocking)** | Done | `ListingAvailability`, `GET/POST/DELETE /vendor/listings/:id/availability` | Structured unavailability ranges; customers read via marketplace endpoint |
