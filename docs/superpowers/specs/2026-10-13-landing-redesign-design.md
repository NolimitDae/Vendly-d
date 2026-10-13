# Vendly brand + landing page redesign — design

Date: 2026-10-13
Status: approved and implemented (round 1)
Scope: round 1 of the rebrand. Brand system, landing page, and the shared navbar/footer/favicon. Logged-in web pages and the mobile app are later rounds.

## Goals

- Replace the Figma-V2 landing page with a from-scratch page built around the new logo (VM monogram, plum-to-orchid gradient, "Vendly / MARKETPLACE" wordmark).
- No grainy images: every product visual is rendered in code and stays sharp at any size.
- Polished, story-driven, cinematic motion that degrades gracefully on phones and for reduced-motion users.
- Act as a pre-launch page for the mobile app (per the Vendly App Development Brief, 6 Oct 2026). The main goal is recruiting founding vendors; customers and planners learn the app is coming.
- Describe how Vendly works at launch in principles that won't change. No invented stats, testimonials or store links, and no fine-print rules that are not built yet (25% deposit, balance timing, 48-hour release, $3 minimum fee).

## Non-goals

- Restyling logged-in pages (marketplace, bookings, chat, wallet, dashboards, admin) or the mobile app.
- New product features, a CMS, a waitlist backend, or live data on the landing page.
- Changing Figma. The Figma file stops being the source of truth for the landing page.

## 1. Brand

### Logo

Redrawn by hand as SVG from the owner's 1760×1120 logo image (no vector original exists). The VM mark follows the image's geometry: rounded strokes, one horizontal gradient across the whole mark. The wordmark is set cleanly in Plus Jakarta Sans ExtraBold; the supplied render has glyph glitches (notched "e" and "d", a flagged "l", a clipped "y") that are not reproduced. The stacked variant keeps "MARKETPLACE" beneath the wordmark, as in the owner's first reference. One React component, `Logo`, with:

- `variant`: `mark` (VM only), `horizontal` (mark + "Vendly"), `stacked` (mark, "Vendly", "MARKETPLACE").
- `tone`: `light` (for light backgrounds: plum wordmark) and `dark` (for plum/dark backgrounds: white wordmark). The mark keeps its gradient in both.
- An accessible name ("Vendly") on every variant; decorative copies use `aria-hidden`.

The favicon / app icon (`app/icon.svg`) is generated from the same mark geometry. The logo is delivered on its own for approval before the page is built.

### Colour tokens

Mark, wordmark and background values are sampled from the owner's logo image; the rest are derived from them. Added to `app/globals.css` alongside the existing tokens (existing names are untouched so logged-in pages do not change):

| Token | Value | Use |
|---|---|---|
| `plum-950` | `#1E0822` | Dark section backgrounds |
| `plum-900` | `#3A1040` | Headings, wordmark |
| `plum-700` | `#5E1B66` | Hover/pressed states |
| `orchid-500` | `#A84AB0` | Accents, focus rings |
| `brand-gradient` | `#4A1650 → #7A2A82 → #A84AB0` (left to right) | Primary buttons, highlights, the mark |
| `blush-50` / `blush-100` | `#FBF4F9` / `#F3E6F0` | Light section backgrounds (`blush-100` is the logo background) |
| `ink-600` | `#4A3F4D` | Body text |

All text/background pairs used must meet WCAG AA contrast.

### Type

Plus Jakarta Sans (already loaded). Display headlines at weight 800; eyebrow labels small, uppercase, wide letter-spacing (echoing "MARKETPLACE").

## 2. Page content

Source of truth for claims: the Vendly App Development Brief (launch product), stated as principles. Where the current code differs (e.g. vendor subscription plans exist in code, but vendors are free at launch per the brief), the page follows the brief.

Primary audience before launch: vendors. Primary action everywhere: "List your business free" → `/register` (vendor sign-up). Customers and planners see "App coming soon" store badges (not links).

1. **Navbar** — frosted plum bar, horizontal logo, links: How it works, For vendors, For planners, Pricing. "Log in" and a gradient "List your business free". Existing logged-in user menu and notification bell kept as-is functionally.
2. **Hero** — headline "Book trusted vendors. Protected until the job is done." Primary button: "List your business free"; secondary: "App coming soon" badges. Visual: 3D phone cycling Home → vendor profile → booking confirmed, with floating chips ("Contract signed ✓", "Payment held", "Proof photo uploaded").
3. **Categories** — Beauty & glam, Decor, DJs & entertainment, Catering, Rentals, Photography & video, Venues.
4. **How it works** (pinned scroll story) — 1 Find a vendor (search, filters, reviews, verified badge); 2 Request & sign (pick a package and date, add notes, sign the vendor's contract in the app); 3 Pay securely (payment is held by Vendly, not paid straight to the vendor); 4 The event happens (vendor uploads a proof photo; digital work is delivered for approval); 5 Vendor gets paid, both sides review. The phone screen changes per step.
5. **Pricing** — Vendors: free to join, no commission, no listing fees. People booking: a 5% Vendly Protection fee on top of the vendor's price, which pays for held payments, verified vendors and dispute support. Price, fee and total always shown separately. Example: a $1,000 booking costs $1,050 and the vendor receives the full $1,000.
6. **Founding vendors** — dark plum band: vendors who join before launch keep a Founding Vendor badge on their profile and get a discount on Vendly Pro when it launches. Eligibility is determined by account creation date before the public launch; no new code is needed now. CTA → `/register`.
7. **One app, three roles** (tabs) —
   - Customers: browse and save vendors, chat, book with notes and reference photos, pay securely, approve deliveries, review.
   - Vendors: services and packages, rentals with stock you control, availability calendar, contracts (Vendly template or your own), proof photos, digital delivery, payouts through Stripe.
   - Event planners: everything customers get, plus client events with every vendor, payment and status in one place, an event group chat, a run-of-show timeline, a budget tracker, a read-only client view and saved vendor teams. Planners are verified by Vendly.
8. **Trust & safety** — held payment (described as "held payment", never "escrow"); no proof, no payout; signed contracts with a signature certificate; verified vendors and planners; if something goes wrong the money stays held and the Vendly team reviews it.
9. **FAQ** — fees, when vendors get paid, cancellations (vendor sets a flexible, moderate or strict policy; a vendor cancelling means a full refund including the fee), contracts, rentals, launch timing.
10. **Final CTA + footer** — stacked logo, navigation, legal links (`/privacy`, `/terms`, `/contact-us`), "Coming soon" badges. Social icons hidden until real accounts exist.

Payment schedules (brief revision, Oct 2026): vendors choose how customers pay per package (pay in full, deposit + balance, 2–4 scheduled payments, or pay after service for events within 6 days), with category defaults; the 5% fee is charged with the first payment; trusted vendors can receive their non-refundable deposit early, with Vendly refunding the customer in full if they then cancel or no-show. The page therefore promises that customers are *protected* until the job is done (not that all money is held until then), names the four ways to pay without percentages or due dates, and explains early release in the FAQ.

Removed: invented stats (17K+, 12+, 91%), testimonials, inert carousel arrows, the dead "About Us" button, "Explore the marketplace" as a main action (a customer web app is out of scope for v1 per the brief), and the false "milestone-based payments" claim.

## 3. Motion and product visuals

### Phone screens

`PhoneFrame` renders a device bezel at true phone proportions and accepts a screen. Screens are small presentational components: Home, Vendor profile, Booking request with notes, Contract signing, Checkout (price / fee / total), Proof photo, Delivery approval, Chat, Planner event overview. Screens follow the owner's `vendly-app.html` prototype and investor-page phone demo where supplied. Sample content lives in `content.ts` and uses clearly fictional vendors (e.g. "Glow Studio by Ama"). Screens are `aria-hidden`; each phone has a short text alternative describing what it shows.

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
│   │   ├── Hero.tsx, Categories.tsx, HowItWorks.tsx, Pricing.tsx,
│   │   ├── FoundingVendors.tsx, Roles.tsx, Trust.tsx, Faq.tsx, FinalCta.tsx
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
- No invented or premature content: the page contains none of "17K", "12+ countries", "91%", testimonial names, "milestone", "escrow", "25%".
- Pricing section states 5% and "free" for vendors, and the $1,000 → $1,050 example adds up.
- Roles tabs switch panels by click and keyboard.
- FAQ items expand and collapse.
- Every `Logo` variant exposes an accessible name.
- With reduced motion, no GSAP timelines/ScrollTriggers are created.

Manual (Playwright), at 1440 / 768 / 375 widths in light and dark theme: no console errors, no failed image loads, no horizontal overflow; screenshots for review.

Before push: `tsc --noEmit`, full Jest suite, `next build`.

## Delivery

1. Logo (all variants + favicon) for approval.
2. Landing page, navbar, footer as one commit after the logo is approved.
