# David's to-do list

_Everything in the code is built and pushed (or ready to push). These are the steps only you can do:
accounts, settings, keys and decisions. Work top to bottom; the first section matters most._

Where things live:
- **Railway** = your hosting. Each service (backend, website) has its own **Variables** tab.
- "Set `X` on the backend" means: Railway → backend service → Variables → New variable → name `X`, then redeploy.

---

## 1. Do these first (things are broken or at risk without them)

- [ ] **Keep uploaded files from disappearing.** Right now photos, avatars, proof photos, signed contracts and
      event files are saved on the server's own disk, which Railway wipes on every deploy.
  1. Railway → backend service → **Settings → Volumes → Add volume**, mount path `/data`.
  2. Set on the backend: `STORAGE_DIR=/data/storage` and `PRIVATE_STORAGE_DIR=/data/private`.
  3. Redeploy. (Anything uploaded before this is already gone; vendors may need to re-add listing photos.)
- [ ] **Check the latest deploys went through.** Railway → each service → Deployments → the newest one should be green.
      If one is red, send me the build log.
- [ ] **Stripe, so card payments work end to end:**
  - Set on the **website**: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (starts `pk_live_` or `pk_test_`).
  - Set for **app builds**: `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (same key; goes in the EAS environment, see section 4).
  - Stripe dashboard → Developers → Webhooks → your endpoint `https://<your-api-domain>/api/payment/stripe/webhook`
    must listen for: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`,
    `payment_intent.amount_capturable_updated`, `checkout.session.completed`, `customer.subscription.updated`,
    `customer.subscription.deleted`, `invoice.payment_succeeded`.
  - Copy that endpoint's signing secret into `STRIPE_WEBHOOK_SECRET` on the backend.
  - Stripe → Connect → turn on Express accounts (vendors get paid through it).
- [ ] **Rotate the Figma token** you pasted in chat: Figma → Settings → Security → revoke it, make a new one, paste it into
      `C:\Users\David\.figma-token` (never into chat).

## 2. Sign in with Google and Apple

The buttons are built; they need keys.

- [ ] **Google:** Google Cloud Console → APIs & Services → Credentials → create three **OAuth client IDs**:
      iOS (bundle `com.vendly.mobile`), Android (package `com.vendly.mobile` + your signing SHA-1), and Web.
  - Backend: `GOOGLE_CLIENT_IDS=<web id>,<ios id>,<android id>`
  - App builds: `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
  - Until this is done the Google button says "coming soon".
- [ ] **Apple:** Apple Developer → Identifiers → `com.vendly.mobile` → tick **Sign in with Apple**.
  - Backend: `APPLE_CLIENT_IDS=com.vendly.mobile`

## 3. Monitoring (free tiers are enough to start)

- [ ] **Sentry** (error alerts): create an organisation and three projects (Node/NestJS, Next.js, React Native). Copy each DSN:
  - Backend: `SENTRY_DSN` · Website: `NEXT_PUBLIC_SENTRY_DSN` · App builds: `EXPO_PUBLIC_SENTRY_DSN`
  - Turn on email alerts for new issues. Payment and payout job failures are tagged `job:due-charges`, `job:releases`, `job:stripe-webhook`.
- [ ] **PostHog** (analytics): create a project, copy the project API key → backend `POSTHOG_KEY`
      (and `POSTHOG_HOST=https://eu.i.posthog.com` if you pick the EU region).
      Events you'll see: signup, booking_requested, booking_accepted, payment_succeeded / failed, payout_released,
      dispute_opened / resolved, quote_sent, rental_requested.
- [ ] Backend: `GEOCODER_CONTACT_EMAIL=<an email you read>` (the free map lookup for "near me" asks for one).

## 4. Try the app on your iPhone

Expo Go can't run card payments, Apple sign-in, the camera stamp or haptics; you need a test build (one-off, ~20 min).

- [ ] Install the tools: `npm i -g eas-cli`, then `eas login` (your Expo account, owner `nolimittechs-organization`).
- [ ] Put the `EXPO_PUBLIC_*` keys from sections 1–3 in EAS: expo.dev → project → Environment variables (or tell me and I'll set up the command).
- [ ] In `Mobile/`: `eas build --profile development --platform ios` → open the link on your iPhone to install.
      (First time it asks you to register the phone and sign in to your Apple Developer account.)
- [ ] Run `npx expo start --dev-client` on your computer and open the app.
- [ ] Walk through: sign up → find a vendor → book with Stripe test card `4242 4242 4242 4242` → vendor accepts →
      card charged → chat + quote → rental + return → proof photo with the camera → dispute → admin resolves.
      Note anything odd and send it to me.
- [ ] After that, small fixes can go out without a new build: `eas update --channel development` (or `preview` / `production`).

## 5. App Store and Google Play

- [ ] Apple Developer Program ($99/year) and Google Play Console ($25 once), if you don't have them.
- [ ] App Store Connect → New app → bundle `com.vendly.mobile`. Note the **Apple ID number (ascAppId)** and your **Team ID**.
- [ ] Send me: Apple ID email, ascAppId, Team ID → I'll fill in `eas.json` submit settings.
      Google: create a service account with Play access, download its JSON key (keep it private) → I'll wire `eas submit`.
- [ ] Store listing: screenshots (I can make them from the app), description, keywords, support URL, privacy policy URL
      (the website `/privacy` page).
- [ ] Privacy questionnaires: the app uses **location** (only to stamp proof photos and "near me"), **camera/photos**,
      **payment info** (handled by Stripe), **email/name**, and crash reports (Sentry, if enabled).
- [ ] Then: `eas build --profile production --platform all` and `eas submit --platform all`.

## 6. Legal and wording (needs a lawyer's eye)

- [ ] Contract templates and the Terms page still say **"Vendly service fee"**; it should read **"Vendly Protection fee"**.
- [ ] Have a lawyer review: the contract templates, cancellation tiers, hold-and-release of funds (3 days / 48h after proof),
      early deposit release and clawback, rental security deposits and damage/late fees, the dispute process,
      location stamping on proof photos, and the client read-only sharing of events.

## 7. Set up the business side in the admin dashboard

- [ ] Admin → Settings: Vendly Protection fee %, minimum fee, vendor commission %, per-category fee overrides.
- [ ] Admin → Settings → feature flags: to hide rentals everywhere (apps and website), add a flag named `rentals` and switch it off.
      Rentals show by default. Other flag names aren't connected to anything yet; tell me what else you want switchable.
- [ ] Admin → Promo codes: any launch codes.
- [ ] Admin → Vendors: approve vendor licences (vendors can now upload them from the app).

## 8. Decisions I need from you

- [ ] **One login, several roles?** Should someone be both a customer and a vendor (switching modes), or keep one role per account?
- [ ] **Light mode in the app** (parked for now; about a day of work).
- [ ] **Storage long-term:** a Railway volume (section 1) is fine to start; S3 is better once you have lots of photos. Your call when.
- [ ] **"Near me" on the website search too?** It's in the app now; the website still filters by typed location.

## Good to know

- Card holds last about 7 days, so the security deposit on a rental longer than ~6 days may lapse before the return;
  any damage fee is then charged to the saved card instead.
- Bookings paid through the old Stripe Checkout (before the new payment engine) keep the old payout path.
- "Near me" uses OpenStreetMap's free geocoder (one lookup a second). Fine for now; swap for Google/Mapbox if listings grow into the thousands.
- Every push notification is now also kept in the inbox (app + website notifications page).
