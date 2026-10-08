# Vendly — Issues & Risks Log

_Phase 0 audit — 2026-10-08. No fixes applied yet._

## Security

| ID | Location | Issue |
|----|----------|-------|
| S1 | `Back-end/src/modules/payment/` | Stripe webhook endpoint must verify the `stripe-signature` header before processing. If verification is absent or skipped, any caller can fake payment events. |
| S2 | `Back-end/src/modules/subscriptions/subscriptions.service.ts:274` | `cancel()` lists the last 10 Stripe checkout sessions globally and matches on `metadata.vendor_id`. If pagination is insufficient it may miss the correct session, or a race condition could cancel the wrong subscription. |
| S3 | General | No `.env.example` files found in repo roots. Developers must know all required env vars from memory, increasing the chance of misconfiguration in production. |
| S4 | `Front-End/` | Auth tokens stored in cookies via `CookieHelper`. Confirm cookies are `HttpOnly` and `SameSite=Strict`; if readable by JS, they are vulnerable to XSS theft. |

## Crash Risks

| ID | Location | Issue |
|----|----------|-------|
| C1 | `Back-end/Dockerfile` | `CMD ["node", "dist/src/main"]` — the nested path exists because `prisma/generated/*.ts` imports shift TypeScript's inferred `rootDir` from `./src` to `.`. If `tsconfig.json` is changed without understanding this, the build will silently produce the wrong output path and the container will crash on startup. |
| C2 | `Back-end/src/modules/subscriptions/subscriptions.service.ts:373` | `invoice.payment_succeeded` handler accesses `invoice.parent?.subscription_details?.subscription` (Stripe v18 basil API). If the API version is downgraded or the SDK is updated without checking, this path will break silently (returns `undefined`). |
| C3 | `Back-end/prisma.config.ts` | Prisma 7 datasource URL lives here, not in `schema.prisma`. Running `npx prisma generate` or `migrate` without `DATABASE_URL` set (e.g., in CI) will throw `PrismaConfigEnvError`. The Dockerfile workaround passes a dummy URL; CI pipelines need the same treatment. |
| C4 | `Mobile/` | Expo SDK 54 — no `eas.json` submission channels visible. OTA updates and store builds have not been verified in this audit. |

## Dead / Incomplete Code

| ID | Location | Issue |
|----|----------|-------|
| D1 | `Back-end/src/modules/subscriptions/subscriptions.service.ts:393-403` | `customer.subscription.updated` and `customer.subscription.deleted` webhook handlers log but take no action. Vendor subscription status will not update when Stripe signals renewal failures or cancellations. |
| D2 | `Back-end/src/modules/chat/notification/` | Notification module exists but Expo push notification integration (device token storage + `expo-server-sdk` calls) is not confirmed. In-app notifications may work; mobile push likely does not. |
| D3 | `Back-end/src/modules/vendor/listing/` | Listing CRUD module is present but upload/image handling for listing photos is unverified — `public/storage` is gitignored and the directory creation in Dockerfile uses `mkdir -p ./public` with no storage backend configured. |
| D4 | `Back-end/src/cmd.ts` | Utility script at repo root of `src/`. Purpose unclear; not referenced from `main.ts` or any module. May be a leftover migration/seed script. |
| D5 | `Front-End/hooks/useNotifications.test.ts` | Only test file found in the frontend. No test coverage for services, components, or API calls. |
