# Vendly Patch: Vendor–Customer Contracts (In-House E-Signature)

Put this file in the repo at `docs/CONTRACTS.md`. It is the spec for Claude Code.

## Goal

Every booking has a signed contract between the vendor and the customer (or event planner), built into Vendly. No DocuSign or other third-party e-signature service.

- Vendors either use the **Vendly default contract** (customized with their own details) or **upload their own PDF contract**.
- Customers sign inside the app at the request step. The vendor countersigns by accepting.
- Vendly generates a final signed PDF with an audit trail, stores it privately, emails it to both sides, and attaches it to the booking, event and any dispute.

Vendly is not a party to the vendor–customer contract. Vendly's own Terms of Service always control payments, fees, held funds, refunds and disputes. Every contract must say so.

## How it fits the existing booking flow

This hooks into the payment flow from Phase 1 (card saved at request, deposit charged on vendor acceptance). No extra checkout step.

1. Customer picks a package and date, adds booking comments, and reviews the contract, pre-filled with the booking details.
2. Customer signs, then sends the request. The card is saved, nothing is charged.
3. Vendor reviews the request and the signed contract, then taps **Accept & Sign**. This is the countersignature.
4. The contract becomes **Executed**. The deposit is charged, and the final PDF is generated, stored and emailed.
5. If the vendor declines or the request expires, the contract becomes **Void** and no charge is made.

Custom quotes: when a vendor sends a custom quote in chat, a contract is generated for that quote. The customer signs when accepting the quote, and the vendor's signature comes from sending it.

## Data model (Prisma)

Propose exact models before writing migrations. Expected shape:

- **ContractTemplate**: Vendly default templates managed by admins. Fields: category (general, photography/video, rentals, catering, entertainment, venue, beauty), version, title, body with merge fields, status (draft, active, retired), timestamps. A new version never changes contracts already signed.
- **VendorContract**: a vendor's contract setup. Fields: vendor, type (DEFAULT or UPLOADED), the base template version (if DEFAULT), the vendor's custom field values and additional clauses, the uploaded PDF file and its SHA-256 hash (if UPLOADED), version number, status (active, archived, disabled by admin), which packages it applies to (all or selected), timestamps.
- **BookingContract**: one per booking, a frozen snapshot. Fields: booking, the vendor contract version used, rendered content with merge fields filled, status (draft, awaiting customer signature, awaiting vendor signature, executed, void, superseded), the executed PDF file key, final PDF SHA-256 hash, version number, and a link to the contract it replaced if it's an amendment.
- **ContractSignature**: one per signer. Fields: booking contract, user, role (customer, planner, vendor), typed legal name, drawn signature image (optional), consent text version, signed at, IP address, user agent, app version, device platform, document hash at signing.
- **ContractAuditEvent**: an append-only log. Events: created, viewed, signed, countersigned, executed, emailed, downloaded, voided, superseded, admin viewed. Each records who, when, IP and details. Never updated or deleted.

## Vendor setup

New screen in the vendor dashboard: **Contracts**.

**Option A: Vendly default contract**

- The vendor picks their category template and fills in their details: business legal name, business address, cancellation policy (the same preset chosen for payments: flexible, moderate or strict), overtime rate, travel fee, setup and teardown times, and category-specific fields (below).
- Optional **Additional terms** box (up to 3,000 characters) for the vendor's own clauses.
- Live preview with sample booking data.

**Option B: Upload own contract**

- PDF only, up to 10 MB. Check the real file type, not just the extension; reject encrypted or password-protected PDFs.
- No signature-field placement. Vendly appends two generated pages to the vendor's PDF:
  1. **Booking addendum**: parties, event date, time and venue, package, price, service fee, deposit and balance schedule, cancellation preset, booking comments, and the platform terms clause (below)
  2. **Signature certificate**: signatures and audit details
- The vendor confirms with a checkbox that the contract is theirs and doesn't conflict with Vendly's terms.

**Both options**

- Assign the contract to all packages or selected ones.
- Editing creates a new version. It applies only to future bookings; existing bookings keep the version that was signed.
- Vendors must have an active contract before accepting paid bookings, or they can choose "Use Vendly default" with one tap.

## Default contract template content

Draft these as templates. Mark every clause `[LAWYER REVIEW]` until a lawyer approves it.

**General sections (every category)**

1. Parties (vendor business, customer or planner) and that Vendly is a platform, not a party
2. Services: package name, description, inclusions
3. Event details: date, start and end time, venue address, guest count
4. Price and payment: vendor price, deposit percentage and amount, balance due date, all paid through Vendly; the service fee is paid to Vendly
5. Cancellation and rescheduling, matching the vendor's preset
6. Vendor responsibilities: arrive on time, provide the services described, proof-of-service photo
7. Customer responsibilities: venue access and permissions, accurate details, safe working conditions
8. Overtime and travel fees
9. Weather, emergencies and events outside either party's control
10. Limitation of liability between vendor and customer
11. Independent business: the vendor is not Vendly's employee or agent
12. Disputes: Vendly's dispute process first, then the vendor's governing law
13. Platform terms clause: "Payments, fees, held funds, refunds and disputes are governed by the Vendly Terms of Service, which control if anything in this contract conflicts with them."
14. Additional terms from the vendor
15. Electronic signature consent
16. Entire agreement

**Category addenda**

- **Photography and video**: delivery time, number of edited images or video length, revisions included, usage rights (personal or commercial), vendor keeps copyright, portfolio use permission (customer can opt out), what happens if equipment fails
- **Rentals**: item list with quantities, delivery and pickup times, condition at drop-off, return condition and return photos, security deposit, damage and loss charges, late fees per day
- **Catering**: menu, headcount deadline, allergy disclosures from booking comments, food safety, leftover policy, service staff hours
- **Entertainment (DJ, band, MC)**: performance length, breaks, equipment and power needs, volume and venue rules, song requests
- **Venue**: capacity, access hours, outside vendor rules, cleanup, damage deposit, noise curfew
- **Beauty and glam**: number of people, allergy and sensitivity disclosure, patch test option, start time and lateness policy

## Merge fields

Filled from the booking when the contract is generated: vendor business name, vendor contact, customer or planner name, client name (planner bookings), event name, event date, start and end time, venue address, guest count, package name and description, vendor price, service fee, total, deposit amount, balance and due date, cancellation preset text, booking comments, rental items and quantities, delivery time and revisions (digital delivery), usage rights, booking ID, contract version.

A missing required field blocks sending, with a clear message saying what's missing.

## Signing experience (mobile)

- The contract opens full-screen with readable text (no zooming a PDF on a phone). Uploaded PDFs show in a PDF viewer with the addendum below.
- The **Sign** button activates only after the signer scrolls to the end.
- Required checkbox: "I agree to sign electronically and receive this contract electronically."
- Typed full legal name (required), plus an optional drawn signature (for example react-native-signature-canvas).
- After signing: a confirmation screen and a "View contract" link on the booking.
- Vendor side: **Accept & Sign** on the request screen, with the same scroll, consent and name steps. The first time only, offer to save the vendor's signature for future bookings; still record a fresh signing event each time.

## Signed PDF and storage

- Generate the final PDF on the server (pdf-lib or PDFKit; avoid a headless browser on Railway unless needed).
  - Default contract: render the filled contract, then the signature certificate page.
  - Uploaded contract: the vendor's original PDF, then the booking addendum, then the signature certificate.
- The signature certificate shows each signer's name, signature image, role, date and time (with time zone), IP, device, and the document hash. It also shows the booking ID and a verification code.
- Compute a SHA-256 hash of the final PDF and store it. Add an endpoint that checks an uploaded PDF against the stored hash, so a tampered copy can be detected.
- Store PDFs in a **private** bucket through the existing storage adapter. Serve them only through short-lived signed URLs to the customer or planner, the vendor, and admins.
- Email the executed PDF to both parties, attached or as a secure link.

## Changes after signing (amendments)

- Changing the date, time, venue, package, price, quantities or cancellation terms requires a new contract version, signed by both sides. The old one becomes **Superseded** and stays viewable.
- Editing booking comments does not require re-signing. The comment history stays on the booking.
- Payment changes from an amendment (price difference, refunds) follow the Phase 1 payment rules.
- If the customer hasn't signed an amendment within 48 hours, notify both sides; the original contract remains in force.

## Event planners

- The planner signs as the customer for bookings they make, and the contract names the client as "on behalf of" when a client is attached to the event.
- The event detail screen shows every vendor's contract with its status (awaiting signature, executed) and a download-all button that creates a zip of executed PDFs.
- Optional, behind a feature flag: client co-signature (off at launch).

## Admin

- Manage default templates: create, edit, version, activate and retire.
- View any booking's contract, signatures and full audit log. Admin views are themselves logged.
- Disable a vendor's uploaded contract (for example illegal or abusive terms). The vendor is then moved to the Vendly default and notified.
- The dispute queue shows the executed contract next to the chat, photos and payment timeline.

## Notifications

Push and email for:

- Contract ready to sign (amendments and custom quotes)
- Customer signed (to the vendor)
- Contract executed (to both, with the PDF)
- Amendment requested or signed
- Reminder if a contract is waiting on a signature for 24 hours
- Vendor's uploaded contract disabled by admin

## Account deletion and record keeping

- Executed contracts are kept for 7 years, even after either party deletes their account (legal records). On deletion, keep the contract PDF and audit log but remove the user's other personal data.
- Note this in the privacy policy and in the account deletion screen ("Signed contracts are kept for 7 years for legal records").
- Uploaded vendor contracts and signature images are private and never shown publicly.

## Security

- Only signers, the vendor, the booking's planner and admins can read a contract; enforce this in every endpoint and test it.
- Rate limit signing and PDF download endpoints.
- Signature images and PDFs are never sent to analytics or crash reports.
- Hash and audit records are write-once.

## Tests (required)

- Merge fields fill correctly for every category, and a missing required field blocks sending
- Full flow: customer signs, vendor accepts and signs, contract executes, PDF generates, hash stores, email sends
- Decline and expiry void the contract with no charge
- An amendment supersedes the old version and requires both signatures
- Uploaded PDF validation rejects non-PDFs, encrypted PDFs and files over 10 MB
- A user who isn't a party gets denied on every contract endpoint
- The hash check detects a modified PDF
- Executed contracts survive account deletion while other personal data is removed
- A vendor template edit doesn't change already signed contracts

## Out of scope

- DocuSign, Dropbox Sign or any third-party e-signature service (possible later as a premium option)
- Placing signature fields inside uploaded PDFs
- Notarization, and more than three signers on one contract

## Done when

- [ ] A vendor sets up the default contract, and another uploads a PDF, both on a phone
- [ ] A customer signs at request, the vendor accepts and signs, and both receive the executed PDF by email
- [ ] The PDF includes the signature certificate, and the hash check confirms it
- [ ] Changing the event date forces a re-signed amendment
- [ ] A planner sees all vendor contracts on the event screen and downloads them as a zip
- [ ] Admin can view the audit log and disable an uploaded contract
- [ ] All tests pass
