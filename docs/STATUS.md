# Vendly Feature Status

_Last updated: 2026-10-08_

| Feature | Status | Key Files | Notes |
|---------|--------|-----------|-------|
| **Authentication** | Done | `Back-end/src/modules/auth/` | JWT + refresh tokens, local strategy, guards |
| **User registration / profiles** | Done | `auth.service.ts`, `vendor.module.ts` | Separate customer & vendor profile creation |
| **Vendor profile & settings** | Partial | `Back-end/src/modules/vendor/`, `Front-End/app/(Frond-End)/vendor/` | Profile edit exists; advanced settings (bank, KYC) unclear |
| **Marketplace / discovery** | Done | `Back-end/src/modules/marketplace/`, `Front-End/app/(Frond-End)/marketplace/` | Listing browse + search endpoints exist |
| **Vendor listings (CRUD)** | Partial | `Back-end/src/modules/vendor/listing/` | Create/read present; update/delete need verification |
| **Search & filters** | Partial | `marketplace.service.ts`, `Front-End/hooks/useSearch.ts` | Basic search; advanced filters (location, date) unclear |
| **Booking flow** | Partial | `Back-end/src/modules/booking/`, `Front-End/app/(Frond-End)/bookings/` | Booking creation exists; confirmation/approval flow needs review |
| **Booking deposit / payment** | Partial | `Back-end/src/modules/booking/deposite/` | Stripe deposit capture present; full booking payment flow unclear |
| **Stripe subscriptions (vendor)** | Done | `Back-end/src/modules/subscriptions/subscriptions.service.ts` | Plans: Free Trial, Starter, Pro, Elite, Premium; webhook handler present |
| **Stripe Connect (vendor payouts)** | Missing | — | No Connect onboarding or payout routes found |
| **Wallet / withdrawals** | Partial | `Back-end/src/modules/payment/withdraw/`, `Front-End/app/(Frond-End)/wallet/` | Withdraw module exists; balance tracking mechanism unclear |
| **In-app chat** | Done | `Back-end/src/modules/chat/`, `Front-End/app/(Frond-End)/chat/` | Real-time Socket.IO; conversation list sidebar; message history |
| **Notifications** | Partial | `Back-end/src/modules/chat/notification/`, `Front-End/hooks/useNotifications.ts` | In-app notifications present; push (Expo) not confirmed |
| **Reviews & ratings** | Partial | `Back-end/src/modules/review/` | Module exists; frontend review UI unclear |
| **Saved listings** | Done | `Back-end/src/modules/saved-listings/`, `Front-End/app/(Frond-End)/saved-listings/` | Save/unsave listings |
| **Event planner tools** | Partial | `Back-end/src/modules/event-planner/`, `Front-End/app/(Frond-End)/event-planner/` | Module scaffolded; feature completeness unclear |
| **Events management** | Partial | `Back-end/src/modules/events/` | Module exists; no frontend events pages found |
| **Rental inventory / availability** | Missing | — | No inventory/calendar blocking found in schema or modules |
| **Photo proof of service** | Missing | — | Not found in codebase |
| **Digital delivery (files/links)** | Missing | — | Not found in codebase |
| **Contact us** | Done | `Front-End/app/(Frond-End)/contact-us/` | Frontend page present |
| **Admin dashboard** | Partial | `Back-end/src/modules/admin/`, `Front-End/app/(admin)/` | Routes and basic admin views exist; completeness unclear |
| **Application management** | Partial | `Back-end/src/modules/application/` | Module present; purpose (vendor applications?) needs review |
| **Mobile app (Expo)** | Partial | `Mobile/src/screens/` | Customer, vendor, and event planner screens scaffolded; feature parity with web unclear |
| **Settings / account** | Partial | `Front-End/app/(Frond-End)/settings/` | Frontend settings page exists |
