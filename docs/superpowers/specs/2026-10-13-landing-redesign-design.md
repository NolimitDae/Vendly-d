# Vendly brand + landing page redesign — design

Date: 2026-10-13
Status: awaiting review
Scope: round 1 of the rebrand. Brand system, landing page, and the shared navbar/footer/favicon. Logged-in web pages and the mobile app are later rounds.

## Goals

- Replace the Figma-V2 landing page with a from-scratch page built around the new logo (VM monogram, plum-to-orchid gradient, "Vendly / MARKETPLACE" wordmark).
- No grainy images: every product visual is rendered in code and stays sharp at any size.
- Polished, story-driven, cinematic motion that degrades gracefully on phones and for reduced-motion users.
- Every statement on the page is true of the current product. Vendly has not launched: no invented stats, testimonials, or store links.

## Non-goals

- Restyling logged-in pages (marketplace, bookings, chat, wallet, dashboards, admin) or the mobile app.
- New product features, a CMS, a waitlist backend, or live data on the landing page.
- Changing Figma. The Figma file stops being the source of truth for the landing page.

## 1. Brand

### Logo

Redrawn by hand as vector SVG from the reference image (or traced from an original file if one is supplied). One React component, `Logo`, with:

- `variant`: `mark` (VM only), `horizontal` (mark + "Vendly"), `stacked` (mark, "Vendly", "MARKETPLACE").
- `tone`: `light` (for light backgrounds: plum wordmark) and `dark` (for plum/dark backgrounds: white wordmark). The mark keeps its gradient in both.
- An accessible name ("Vendly") on every variant; decorative copies use `aria-hidden`.

The favicon / app icon (`app/icon.svg`) is generated from the same mark geometry. The logo is delivered on its own for approval before the page is built.

### Colour tokens

Added to `app/globals.css` alongside the existing tokens (existing names are untouched so logged-in pages do not change):

| Token | Value | Use |
|---|---|---|
| `plum-950` | `#1E0822` | Dark section backgrounds |
| `plum-900` | `#3B1040` | Headings, wordmark |
| `plum-700` | `#5E1B66` | Hover/pressed states |
| `orchid-500` | `#A84FB5` | Accents, focus rings |
| `brand-gradient` | `#4A1450 → #7B2A87 → #A84FB5` | Primary buttons, highlights, the mark |
| `blush-50` / `blush-100` | `#FBF4F9` / `#F3E4EF` | Light section backgrounds |
| `ink-600` | `#4A3F4D` | Body text |

All text/background pairs used must meet WCAG AA contrast.

### Type

Plus Jakarta Sans (already loaded). Display headlines at weight 800; eyebrow labels small, uppercase, wide letter-spacing (echoing "MARKETPLACE").

## 2. Page content

Section order, with the claims each section makes. Claims were checked against the backend (`Back-end/prisma/schema.prisma`, `booking.service.ts`).

1. **Navbar** — frosted plum bar, horizontal logo, links: How it works, For vendors, For planners, Marketplace. "Log in" and a gradient "Join Vendly" (→ `/register`). Existing logged-in user menu and notification bell are kept as-is functionally.
2. **Hero** — headline in the spirit of "Book trusted vendors. Sign, pay, and track it all in one place." Buttons: "Explore the marketplace" (→ `/marketplace`) and "Join as a vendor" (→ `/register`). Store badges labelled "Coming soon" (not links). Visual: 3D phone cycling search → listing → booking confirmed, with floating chips ("Contract signed ✓", "Payment secured", "New message").
3. **Categories** — Beauty & Personal Care, Creative & Media, Event Services, Rentals, with a marquee of sub-services.
4. **How it works** (pinned scroll story) — 1 Search & filter, 2 Request a booking, 3 Sign the contract, 4 Pay securely, 5 Get it done & review. The phone screen changes per step.
5. **One app, three roles** (tabs) —
   - Customers: search and save listings, chat with vendors, book and pay, leave reviews.
   - Vendors: listings with availability, contract templates, bookings, payouts via Stripe, subscription plans.
   - Event planners: events with budgets and tasks, hire vendors for an event.
6. **Trust & safety** —
   - Pay through Vendly; the vendor's earnings are released to their payout balance only when the booking is completed.
   - E-signed contracts with an audit trail.
   - Vendors are approved by Vendly before going live.
   - Reviews can only be left on a real booking (one per booking).
7. **Vendor band** — dark plum, "Grow your business on Vendly", CTA → `/register`.
8. **FAQ** — payments, contracts, fees, becoming a vendor. Fee answers must match the current service-fee logic; no specific numbers unless taken from code/config.
9. **Final CTA + footer** — stacked logo, navigation, legal links (`/privacy`, `/terms`, `/contact-us`), "Coming soon" badges. Social icons hidden until real accounts exist.

Removed: invented stats (17K+, 12+, 91%), testimonials, inert carousel arrows, the dead "About Us" button, and the false "milestone-based payments" claim. Bookings are paid once in full (any time after confirmation); there are no payment stages, and the page must not imply any.

## 3. Motion and product visuals

### Phone screens

`PhoneFrame` renders a device bezel at true phone proportions and accepts a screen. Screens are small presentational components: Search results, Listing, Booking confirmed, Contract signing, Checkout, Chat, Deliverables & review. Sample content lives in `content.ts` and uses clearly fictional vendors (e.g. "Glow Studio by Ama"). Screens are `aria-hidden`; each phone has a short text alternative describing what it shows.

### Motion layers

- Global: word-by-word headline reveals; sections fade/slide in on enter.
- Hero: pointer-driven 3D tilt (desktop), parallax depths for floating chips, auto-cycling screens with cross-fade.
- How it works: section pins; scroll progress drives the active step, the phone screen, and a progress rail.
- Details: magnetic hover on primary buttons, auto-scrolling category marquee, animated check marks.

### Performance and accessibility rules

- GSAP + ScrollTrigger (already a dependency). No new animation libraries.
- Effects initialise client-side only via `gsap.matchMedia()`:
  - `(prefers-reduced-motion: reduce)` → no motion; everything rendered in its final state.
  - below `lg` or coarse pointer → no tilt, no pinning; How it works renders as a stacked list with light reveals.
- Content is server-rendered and fully readable with JavaScript disabled or before animations load (no content hidden behind an animation that might not run).
- Animations use transforms/opacity only; no layout thrash. No cumulative layout shift from animated elements.

## 4. Architecture

```
Front-End/
├── app/
│   ├── icon.svg                       new favicon from the mark
│   ├── globals.css                    + brand tokens
│   └── (Frond-End)/page.tsx           composes the new sections
├── components/
│   ├── brand/Logo.tsx                 mark / horizontal / stacked × light / dark
│   ├── landing/
│   │   ├── content.ts                 all copy + sample data
│   │   ├── Hero.tsx, Categories.tsx, HowItWorks.tsx, Roles.tsx,
│   │   ├── Trust.tsx, VendorBand.tsx, Faq.tsx, FinalCta.tsx
│   │   ├── phone/PhoneFrame.tsx
│   │   ├── phone/screens/*.tsx        one file per app screen
│   │   └── motion/                    useReveal, usePinnedStory, useTilt (+ fallbacks)
│   ├── Navbar.tsx, Footer.tsx         new logo + colours
│   └── ui/tabs.tsx, ui/accordion.tsx  reused for Roles and FAQ
```

- `components/landing-page/` is deleted, along with images used only by it (verified by search before deletion), including today's `public/landing/` assets. `public/site_logo.png` stays while logged-in pages reference it.
- Each section is a self-contained component reading from `content.ts`; motion hooks are the only client-side code and are isolated in `motion/`.

## 5. Testing and verification

Automated (Jest + Testing Library, alongside existing tests):

- Landing page renders every section heading.
- No invented content: the page contains none of "17K", "12+ countries", "91%", testimonial names, "milestone".
- Roles tabs switch panels by click and keyboard.
- FAQ items expand and collapse.
- Every `Logo` variant exposes an accessible name.
- With reduced motion, no GSAP timelines/ScrollTriggers are created.

Manual (Playwright), at 1440 / 768 / 375 widths in light and dark theme: no console errors, no failed image loads, no horizontal overflow; screenshots for review.

Before push: `tsc --noEmit`, full Jest suite, `next build`.

## Delivery

1. Logo (all variants + favicon) for approval.
2. Landing page, navbar, footer as one commit after the logo is approved.
