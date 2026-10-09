import type { Metadata } from "next";
import Link from "next/link";
import Container from "@/app/_components/Container";

export const metadata: Metadata = {
  title: "Privacy Policy | Vendly",
  description: "How Vendly collects, uses, shares and protects your personal information.",
};

const LAST_UPDATED = "October 9, 2026";

// Draft written from what the apps actually collect; have it reviewed by a lawyer before relying on it.
const sections: { title: string; body: React.ReactNode }[] = [
  {
    title: "Who we are",
    body: (
      <p>
        Vendly is an online marketplace operated by ADEJORO HOLDINGS LLC, a Delaware limited liability company, that
        connects customers and event planners with independent vendors. This policy
        explains what personal information we collect when you use the Vendly website and mobile apps, why we collect
        it, who we share it with and the choices you have. Vendors and customers who book through Vendly are separate
        businesses and people; when a vendor receives your booking details, they handle them under their own practices.
      </p>
    ),
  },
  {
    title: "Information you give us",
    body: (
      <ul>
        <li><strong>Account details:</strong> name, email address, password (stored only as a one-way hash), phone number, profile photo, and optional profile information such as address, city, country, date of birth and a short bio.</li>
        <li><strong>Vendor details:</strong> business name, business address, description, listings (titles, descriptions, prices, photos, location), availability, and licence or verification documents you upload.</li>
        <li><strong>Event planner details:</strong> events you create, including names, dates, venues, guest counts, budgets and tasks.</li>
        <li><strong>Bookings:</strong> the service you book, event date and times, venue address, guest count, booking comments (which can include details such as allergies you choose to share), price and booking status.</li>
        <li><strong>Messages and files:</strong> chat messages between customers and vendors, photo proof of service, deliverables (files and links), and reviews.</li>
        <li><strong>Contracts and signatures:</strong> when you sign a contract we record your typed legal name, any signature you draw, the date and time, your IP address, your device type, app version and browser information, and a fingerprint (SHA-256 hash) of the document you signed. Vendors may also upload their own contract documents.</li>
        <li><strong>Support requests:</strong> what you send us through the contact form.</li>
      </ul>
    ),
  },
  {
    title: "Information collected automatically",
    body: (
      <ul>
        <li><strong>Sign-in cookie:</strong> the website stores a single cookie containing your sign-in token so you stay logged in. We do not use advertising or analytics cookies.</li>
        <li><strong>Device and log data:</strong> IP address, browser or device type and the pages or features you use, recorded in server logs to keep the service secure and working.</li>
        <li><strong>Push notification token:</strong> if you allow notifications in the mobile app, we store a token that lets us send you booking and contract updates.</li>
      </ul>
    ),
  },
  {
    title: "Information from other services",
    body: (
      <ul>
        <li><strong>Payments:</strong> card payments and vendor payouts are processed by Stripe. Vendly does not store your full card number; we keep the identifiers Stripe gives us and a record of transactions. Vendors who receive payouts provide identity and bank details directly to Stripe.</li>
        <li><strong>Google or Facebook sign-in:</strong> if you sign in this way, we receive your name, email address and profile photo from that provider.</li>
      </ul>
    ),
  },
  {
    title: "How we use your information",
    body: (
      <ul>
        <li>To run the marketplace: show listings, process bookings and payments, and let customers and vendors communicate.</li>
        <li>To create, sign, store and verify contracts between customers and vendors, and to keep an audit trail of signing.</li>
        <li>To send account, booking, contract and payment emails and push notifications.</li>
        <li>To keep Vendly safe: verifying vendors, preventing fraud and abuse, enforcing our terms and handling disputes.</li>
        <li>To provide support and improve the service.</li>
        <li>To meet legal obligations, such as keeping financial and contract records.</li>
      </ul>
    ),
  },
  {
    title: "Who we share it with",
    body: (
      <>
        <p>We do not sell your personal information. We share it only as needed to run Vendly:</p>
        <ul>
          <li><strong>The other party to your booking.</strong> Vendors see the customer&apos;s name, contact details and booking details; customers and planners see the vendor&apos;s business details. Both parties receive the signed contract.</li>
          <li><strong>Service providers</strong> that process data for us: Stripe (payments and payouts), our hosting provider (Railway), our email delivery provider, Expo (mobile push notifications) and Google or Facebook (if you use them to sign in).</li>
          <li><strong>Legal and safety reasons:</strong> when required by law, to respond to valid legal requests, or to protect the rights and safety of our users or Vendly.</li>
          <li><strong>Business transfers:</strong> if Vendly is involved in a merger or sale, your information may transfer as part of that transaction under the same protections.</li>
        </ul>
      </>
    ),
  },
  {
    title: "How long we keep it",
    body: (
      <ul>
        <li>We keep your account information for as long as your account is open.</li>
        <li>
          <strong>Signed contracts are kept for 7 years for legal records</strong>, together with their signature details
          and audit trail, even if you or the other party delete your account.
        </li>
        <li>Payment and transaction records are kept as long as tax and accounting rules require.</li>
        <li>
          When you delete your account, we remove your profile and personal details. If you have bookings or signed
          contracts, we keep those records (with your name as it appears on them) but remove your other personal data.
        </li>
      </ul>
    ),
  },
  {
    title: "Your choices and rights",
    body: (
      <>
        <ul>
          <li>You can view and update your profile in your account settings at any time.</li>
          <li>You can delete your account in Settings on the website or in your profile in the app.</li>
          <li>You can turn off push notifications in your device settings.</li>
        </ul>
        <p>
          Depending on where you live, you may have the right to access, correct, delete or receive a copy of your
          personal information, to object to or restrict some processing, and to complain to your local data protection
          authority. To make a request, <Link href="/contact-us">contact us</Link>. We may need to verify your identity
          first, and some information (such as signed contracts) may be kept where the law requires it.
        </p>
      </>
    ),
  },
  {
    title: "Security",
    body: (
      <p>
        We protect your information with encrypted connections (HTTPS), hashed passwords, optional two-factor
        authentication, and access controls. Signed contracts and signatures are stored privately and are available only
        to the people who signed them and authorized Vendly staff, through short-lived download links. No system is
        perfectly secure, so please use a strong, unique password.
      </p>
    ),
  },
  {
    title: "Children",
    body: <p>Vendly is not intended for anyone under 18, and we do not knowingly collect information from children.</p>,
  },
  {
    title: "International transfers",
    body: (
      <p>
        Our service providers may process your information in countries other than your own. Where required, we rely on
        appropriate safeguards for those transfers.
      </p>
    ),
  },
  {
    title: "Changes to this policy",
    body: (
      <p>
        We may update this policy. If we make significant changes, we will let you know by email or in the app before
        they take effect. The date at the top shows when it was last updated.
      </p>
    ),
  },
  {
    title: "Contact us",
    body: (
      <p>
        Questions or requests about your privacy? <Link href="/contact-us">Contact us</Link>.
      </p>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <section className="py-12 sm:py-20 min-h-screen bg-gray-50 dark:bg-gray-900">
      <Container>
        <article className="max-w-3xl mx-auto bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 sm:p-10">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Privacy Policy</h1>
          <p className="mt-2 text-sm text-gray-500">Last updated {LAST_UPDATED}</p>
          <div className="mt-8 space-y-8">
            {sections.map((s) => (
              <section key={s.title} className="space-y-3">
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
