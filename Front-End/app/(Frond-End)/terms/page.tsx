import type { Metadata } from "next";
import Link from "next/link";
import Container from "@/app/_components/Container";

export const metadata: Metadata = {
  title: "Terms of Service | Vendly",
  description: "The terms that govern your use of Vendly, including bookings, contracts, payments, refunds and disputes.",
};

const LAST_UPDATED = "October 9, 2026";
const COMPANY = "ADEJORO HOLDINGS LLC";

// Draft written to match how the platform works today; have it reviewed by a lawyer before relying on it.
const sections: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "agreement",
    title: "1. About these terms",
    body: (
      <>
        <p>
          Vendly is operated by {COMPANY}, a Delaware limited liability company (&quot;Vendly&quot;, &quot;we&quot;,
          &quot;us&quot;). These Terms of Service (&quot;Terms&quot;) govern your use of the Vendly website and mobile
          apps (the &quot;Platform&quot;). By creating an account or using the Platform you agree to these Terms and to
          our <Link href="/privacy">Privacy Policy</Link>. If you don&apos;t agree, don&apos;t use the Platform.
        </p>
        <p>
          <strong>
            Payments, fees, held funds, refunds and disputes for bookings made through Vendly are governed by these
            Terms. If anything in a contract between a customer and a vendor conflicts with these Terms on those
            subjects, these Terms control.
          </strong>
        </p>
      </>
    ),
  },
  {
    id: "platform",
    title: "2. What Vendly is",
    body: (
      <>
        <p>
          Vendly is a marketplace. We let customers and event planners find, book and pay independent vendors for event
          services, and we provide tools for messaging, contracts and payments.
        </p>
        <p>
          Vendly does not provide the event services. Vendors are independent businesses, not employees, agents or
          partners of Vendly. Each booking creates a contract between the customer (or event planner) and the vendor.
          Vendly is not a party to that contract and is not responsible for a vendor&apos;s or customer&apos;s
          performance, except for our role in handling payments and disputes as described in these Terms. We
          don&apos;t guarantee the quality, safety or legality of any service, listing or user, though we may verify
          vendors and remove those who break these Terms.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "3. Accounts",
    body: (
      <ul>
        <li>You must be at least 18 years old and able to form a binding contract.</li>
        <li>Give accurate information and keep it up to date. Vendors must accurately describe their business, services, prices and availability.</li>
        <li>Keep your login details secure. You are responsible for activity on your account. Tell us promptly if you think it has been compromised.</li>
        <li>One person or business per account. Don&apos;t create accounts for others without their permission.</li>
      </ul>
    ),
  },
  {
    id: "bookings",
    title: "4. Bookings and contracts",
    body: (
      <>
        <ul>
          <li>
            <strong>Requesting.</strong> When you request a booking, you review the vendor&apos;s contract, filled in
            with your booking details, and sign it electronically. Your request is an offer to book on those terms.
          </li>
          <li>
            <strong>Accepting.</strong> The booking is confirmed only when the vendor accepts and signs the contract.
            If the vendor declines, or doesn&apos;t accept, the contract is void and you are not charged.
          </li>
          <li>
            <strong>The contract.</strong> The vendor&apos;s contract (the Vendly default contract or the vendor&apos;s
            own uploaded contract with Vendly&apos;s booking addendum) sets out the services, event details, price and
            the vendor&apos;s cancellation policy. Vendors are responsible for the terms they add or upload.
          </li>
          <li>
            <strong>Changes.</strong> Changes to the date, time, venue, services, price, quantities or cancellation terms
            require an amended contract signed by both parties. Until both sign, the existing contract stays in force.
          </li>
          <li>
            <strong>Electronic signatures.</strong> You agree to sign and receive contracts electronically. Electronic
            signatures on Vendly have the same effect as handwritten signatures. We keep a record of each signature
            (including name, time, IP address and device) and a copy of each signed contract.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "payments",
    title: "5. Payments and fees",
    body: (
      <>
        <ul>
          <li>
            <strong>When you pay.</strong> Customers pay through Vendly after the vendor accepts and signs the
            booking. You must not pay, or ask to be paid, outside Vendly for a booking made through Vendly.
          </li>
          <li>
            <strong>What you pay.</strong> Customers pay the vendor&apos;s price plus a Vendly service fee, which is
            currently 5% of the vendor&apos;s price. The fee and total are shown in the contract before you sign.
          </li>
          <li>
            <strong>Vendor fees.</strong> Vendors currently pay no fees to Vendly. We may introduce paid vendor plans
            or fees in the future; we will give vendors at least 30 days&apos; notice, and changes won&apos;t apply to
            bookings already accepted.
          </li>
          <li>
            <strong>Payment processing.</strong> Payments are processed by Stripe. Vendors who receive payouts must
            create a Stripe account and agree to Stripe&apos;s terms. Vendly does not store full card numbers.
          </li>
          <li>
            <strong>Vendly as payment collector.</strong> Vendors appoint Vendly as their limited agent to collect
            payments from customers. A customer&apos;s payment to Vendly satisfies their obligation to pay the vendor
            for that amount.
          </li>
          <li>
            <strong>Held funds and payouts.</strong> We hold the customer&apos;s payment until the vendor marks the
            booking complete. The vendor&apos;s price is then added to the vendor&apos;s payout balance, which the
            vendor can withdraw to their Stripe account. The service fee is kept by Vendly. We may delay or withhold a
            payout while a dispute, chargeback or suspected fraud is being reviewed.
          </li>
          <li>
            <strong>Taxes.</strong> Vendors are responsible for the taxes on their services and income. Prices are shown
            as the vendor sets them.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "cancellations",
    title: "6. Cancellations and refunds",
    body: (
      <ul>
        <li>
          <strong>Customer cancels.</strong> Refunds of the vendor&apos;s price follow the cancellation policy in the
          signed contract (Flexible, Moderate or Strict). The Vendly service fee is not refunded when a customer
          cancels, unless the vendor&apos;s policy gives a full refund.
        </li>
        <li>
          <strong>Vendor cancels or doesn&apos;t show up.</strong> The customer receives a full refund, including the
          service fee. Vendors who cancel confirmed bookings may have their account restricted.
        </li>
        <li>
          <strong>Events outside anyone&apos;s control.</strong> If an event can&apos;t go ahead because of severe
          weather, natural disasters, public health orders or government action, the parties should first try to
          reschedule. If that isn&apos;t possible, we will decide on any refund fairly, taking account of work the
          vendor has already done.
        </li>
        <li>Refunds are returned to the original payment method. Processing times depend on your bank.</li>
      </ul>
    ),
  },
  {
    id: "disputes",
    title: "7. Disputes between customers and vendors",
    body: (
      <>
        <p>
          If something goes wrong with a booking, contact the other party first. If you can&apos;t resolve it,{" "}
          <Link href="/contact-us">contact Vendly</Link> within 7 days after the event date. We will review the signed
          contract, messages, proof-of-service photos, deliverables and payment records, and may ask both parties for
          information.
        </p>
        <p>
          We will decide how funds Vendly is holding for the booking are released or refunded. Our decision about held
          funds is final for those funds, but it does not limit any legal rights either party has against the other.
          Customers agree to use this process before filing a chargeback with their card issuer.
        </p>
      </>
    ),
  },
  {
    id: "vendors",
    title: "8. Vendor responsibilities",
    body: (
      <ul>
        <li>Hold any licences, permits and insurance your services require, and follow all applicable laws.</li>
        <li>Provide the services described in your listing and contract, on time and with reasonable skill and care.</li>
        <li>Keep your availability, prices and listings accurate, and respond to booking requests promptly.</li>
        <li>Upload proof-of-service photos and deliver digital work through Vendly when your booking calls for it.</li>
        <li>
          If you upload your own contract, you confirm you have the right to use it and that it doesn&apos;t conflict
          with these Terms. We may disable a contract that is unlawful, abusive or conflicts with these Terms; your
          bookings will then use the Vendly default contract.
        </li>
      </ul>
    ),
  },
  {
    id: "conduct",
    title: "9. Things you must not do",
    body: (
      <ul>
        <li>Take payments, or arrange bookings, outside Vendly for customers you met on Vendly.</li>
        <li>Post false, misleading or infringing content, or fake reviews.</li>
        <li>Harass, threaten or discriminate against anyone.</li>
        <li>Use the Platform for anything illegal, fraudulent or unsafe.</li>
        <li>Interfere with the Platform&apos;s security or operation, or scrape or copy it without permission.</li>
        <li>Share another user&apos;s personal information except as needed for a booking.</li>
      </ul>
    ),
  },
  {
    id: "content",
    title: "10. Your content and reviews",
    body: (
      <>
        <p>
          You keep ownership of what you post (such as listings, photos, messages and reviews). You give Vendly a
          worldwide, non-exclusive, royalty-free licence to host, display, reproduce and adapt it to run and promote the
          Platform. You confirm you have the rights to everything you post.
        </p>
        <p>
          Customers can review a vendor after a completed booking. Reviews must be honest and based on a real booking. We
          may remove content that breaks these Terms.
        </p>
      </>
    ),
  },
  {
    id: "ip",
    title: "11. Vendly's property",
    body: (
      <p>
        The Platform, including its software, design, logos and the Vendly default contract templates, belongs to Vendly
        or its licensors. You may use the Platform only as these Terms allow. Default contract templates may be used only
        for bookings made through Vendly.
      </p>
    ),
  },
  {
    id: "termination",
    title: "12. Suspension and account deletion",
    body: (
      <p>
        You can delete your account at any time in your settings. We may suspend or close accounts that break these
        Terms, put other users at risk, or that we are required to close by law. Bookings already confirmed, signed
        contracts and payment obligations survive suspension or deletion. Signed contracts are kept for 7 years for legal
        records, as described in our <Link href="/privacy">Privacy Policy</Link>.
      </p>
    ),
  },
  {
    id: "disclaimers",
    title: "13. Disclaimers",
    body: (
      <p>
        The Platform is provided &quot;as is&quot; and &quot;as available&quot;. To the extent the law allows, Vendly
        disclaims all warranties, express or implied, including merchantability, fitness for a particular purpose and
        non-infringement. We don&apos;t promise the Platform will be uninterrupted or error-free.
      </p>
    ),
  },
  {
    id: "liability",
    title: "14. Limitation of liability",
    body: (
      <p>
        To the extent the law allows, Vendly is not liable for indirect, incidental, special, consequential or punitive
        damages, or for lost profits, data or goodwill, or for the acts or omissions of vendors, customers or event
        planners. Vendly&apos;s total liability for any claim relating to the Platform is limited to the greater of (a)
        the fees you paid to Vendly in the 12 months before the claim and (b) US$100. Nothing in these Terms limits
        liability that can&apos;t be limited by law.
      </p>
    ),
  },
  {
    id: "indemnity",
    title: "15. Indemnity",
    body: (
      <p>
        You will defend and compensate Vendly, {COMPANY} and their officers, employees and agents against claims, losses
        and costs (including reasonable legal fees) arising from your breach of these Terms, your content, your services
        (if you are a vendor) or your violation of any law or third-party right.
      </p>
    ),
  },
  {
    id: "law",
    title: "16. Governing law",
    body: (
      <p>
        These Terms are governed by the laws of the State of Delaware, USA, without regard to its conflict-of-laws rules.
        Any dispute with Vendly that isn&apos;t resolved informally will be heard in the state or federal courts located
        in Delaware, and you and Vendly consent to their jurisdiction. If you are a consumer, you may also have rights
        under the laws where you live that can&apos;t be waived.
      </p>
    ),
  },
  {
    id: "changes",
    title: "17. Changes to these terms",
    body: (
      <p>
        We may update these Terms. For material changes we will give at least 30 days&apos; notice by email or in the
        app. Changes don&apos;t apply to bookings already accepted. Continuing to use Vendly after changes take effect
        means you accept them.
      </p>
    ),
  },
  {
    id: "general",
    title: "18. General",
    body: (
      <p>
        If any part of these Terms is unenforceable, the rest stays in effect. Our failure to enforce a term isn&apos;t a
        waiver. You may not transfer your rights under these Terms without our consent; we may transfer ours in
        connection with a merger or sale. These Terms, our Privacy Policy and the contracts you sign on Vendly are the
        entire agreement between you and Vendly about the Platform.
      </p>
    ),
  },
  {
    id: "contact",
    title: "19. Contact",
    body: (
      <p>
        Questions about these Terms? <Link href="/contact-us">Contact us</Link>. Vendly is operated by {COMPANY}.
      </p>
    ),
  },
];

export default function TermsOfServicePage() {
  return (
    <section className="py-12 sm:py-20 min-h-screen bg-gray-50 dark:bg-gray-900">
      <Container>
        <article className="max-w-3xl mx-auto bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 sm:p-10">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Terms of Service</h1>
          <p className="mt-2 text-sm text-gray-500">Last updated {LAST_UPDATED}</p>
          <nav aria-label="Contents" className="mt-6 text-sm">
            <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-primary hover:underline">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="mt-8 space-y-8">
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="space-y-3 scroll-mt-24">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{s.title}</h2>
                <div className="text-[15px] leading-relaxed text-gray-700 dark:text-gray-300 space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_a]:text-primary [&_a]:underline">
                  {s.body}
                </div>
              </section>
            ))}
          </div>
        </article>
      </Container>
    </section>
  );
}
