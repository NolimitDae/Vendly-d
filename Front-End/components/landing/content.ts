// All landing page copy and phone-screen sample data.
// Claims follow the Vendly App Development Brief (Oct 2026) as launch principles; see
// docs/superpowers/specs/2026-10-13-landing-redesign-design.md. Keep fine-print rules
// (deposit %, release timings, minimum fee) out until they are built.

export const VENDOR_SIGNUP_HREF = "/register?type=VENDOR";

export const nav = [
  { label: "How it works", hash: "how-it-works" },
  { label: "For vendors", hash: "vendors" },
  { label: "For planners", hash: "planners" },
  { label: "Pricing", hash: "pricing" },
] as const;

export const hero = {
  eyebrow: "The event services marketplace",
  headline: ["Book", "trusted", "vendors.", "Protected", "until", "the", "job", "is", "done."],
  sub: "Vendly brings beauty, decor, DJs, catering, rentals, photography and venues into one app. Every payment goes through Vendly, so you're protected until the work is done.",
  primary: "List your business free",
  secondary: "App coming soon to iPhone and Android",
  chips: [
    { label: "Contract signed", tone: "green" },
    { label: "Payment held", tone: "plum" },
    { label: "Proof photo uploaded", tone: "orchid" },
  ],
} as const;

export const categories = [
  { name: "Beauty & Glam", items: ["Bridal makeup", "Hair styling", "Nails", "Lashes"] },
  { name: "Decor", items: ["Balloon art", "Florals", "Table styling", "Backdrops"] },
  { name: "DJs & Entertainment", items: ["DJs", "Live bands", "MCs", "Kids' entertainers"] },
  { name: "Catering", items: ["Private chefs", "Buffets", "Cakes", "Mobile bars"] },
  { name: "Rentals", items: ["Chairs & tables", "Tents", "Lighting", "Linens"] },
  { name: "Photography & Video", items: ["Photographers", "Videographers", "Photo booths", "Drones"] },
  { name: "Venues", items: ["Halls", "Gardens", "Rooftops", "Studios"] },
] as const;

export type StepScreen = "profile" | "request" | "checkout" | "proof" | "paid";

export const steps: { title: string; body: string; screen: StepScreen }[] = [
  {
    title: "Find the right vendor",
    body: "Search by category, date, price and rating. Every profile shows packages, real reviews and a verified badge.",
    screen: "profile",
  },
  {
    title: "Request and sign",
    body: "Pick a package and date, add notes and reference photos, and sign the vendor's contract right in the app.",
    screen: "request",
  },
  {
    title: "Pay securely",
    body: "Pay the way your vendor offers: in full, a deposit and balance, a few scheduled payments, or after the service. Every payment goes through Vendly, never straight to the vendor.",
    screen: "checkout",
  },
  {
    title: "The event happens",
    body: "The vendor uploads an in-app proof photo at delivery or setup. Photographers deliver your files for approval.",
    screen: "proof",
  },
  {
    title: "Vendor gets paid, you both review",
    body: "Once the work is confirmed, Vendly releases the payment to the vendor. Then both sides leave a review.",
    screen: "paid",
  },
];

export const pricing = {
  vendors: {
    title: "For vendors",
    price: "Free",
    note: "No commission. No listing fees. You keep 100% of your price.",
    points: ["Choose how customers pay you", "Payouts through Stripe", "Contracts and proof photos built in"],
  },
  bookers: {
    title: "For people booking",
    price: "5%",
    note: "A Vendly Protection fee on top of the vendor's price, charged with your first payment.",
    points: ["Payments protected until the job is done", "Verified vendors", "Full refund if a vendor cancels"],
  },
  example: { vendorPrice: 1000, feePercent: 5 },
} as const;

export const founding = {
  eyebrow: "Founding vendors",
  title: "Join before launch. Keep the perks for good.",
  body: "Vendors who list on Vendly before the app launches keep a Founding Vendor badge on their profile and get a discount on Vendly Pro when it arrives.",
  perks: ["Founding Vendor badge", "Discount on Vendly Pro", "Free listing, no commission"],
} as const;

export type RoleKey = "customers" | "vendors" | "planners";

export const roles: { key: RoleKey; id: string; label: string; title: string; points: string[] }[] = [
  {
    key: "customers",
    id: "customers",
    label: "Customers",
    title: "Plan your event without the chasing",
    points: [
      "Browse vendors by category and save your favourites",
      "Chat before you book, and send notes and reference photos",
      "See every payment, due date, fee and total before you book",
      "Approve photo and video deliveries before the vendor is paid",
    ],
  },
  {
    key: "vendors",
    id: "vendors",
    label: "Vendors",
    title: "Run your bookings in one place",
    points: [
      "List services, packages and rental items with your own stock levels",
      "Choose how customers pay: in full, deposit and balance, instalments or after the service",
      "Set your availability and cancellation policy",
      "Use the Vendly contract for your category or upload your own",
      "Get paid through Stripe as the work is confirmed",
    ],
  },
  {
    key: "planners",
    id: "planners",
    label: "Event planners",
    title: "Every client event, every vendor, one screen",
    points: [
      "Create client events with budgets and book several vendors into each",
      "A group chat for each event with every booked vendor",
      "Share a run-of-show timeline and load-in details",
      "Invite your client to a read-only view of their event",
    ],
  },
];

export const trust = {
  words: ["Held.", "Proven.", "Paid."],
  items: [
    { title: "Protected payments", body: "Payments go through Vendly, not straight to the vendor. If a vendor cancels or doesn't show, you're refunded in full." },
    { title: "No proof, no payout", body: "Vendors upload an in-app photo at delivery or setup before they can be paid." },
    { title: "Signed contracts", body: "Every booking has a contract both sides sign in the app, with a signature certificate." },
    { title: "Verified vendors and planners", body: "Vendly checks vendors' and planners' identity and business details before they go live." },
    { title: "Disputes handled", body: "If something goes wrong, the money stays held while the Vendly team reviews it." },
  ],
} as const;

export const faqs = [
  {
    q: "How much does Vendly cost?",
    a: "Vendors list for free and pay no commission. Whoever books, a customer or an event planner, pays a 5% Vendly Protection fee on top of the vendor's price. You always see the price, the fee and the total separately before paying.",
  },
  {
    q: "How do I pay for a booking?",
    a: "Each vendor chooses how you pay: in full, a deposit with the balance before the event, a few scheduled payments, or after the service for events coming up soon. Before you book, you see every amount, its due date, the Vendly fee and the total, and the schedule is written into your contract.",
  },
  {
    q: "When do vendors get paid?",
    a: "Vendly holds payments and releases them to the vendor once the work is confirmed, backed by an in-app proof photo or, for photos and video, the customer approving the delivery. Trusted vendors with a strong track record can receive their non-refundable deposit once your free-cancellation window ends. If such a vendor later cancels or doesn't show, Vendly still refunds you in full. Payouts go through Stripe.",
  },
  {
    q: "What happens if a booking is cancelled?",
    a: "If the vendor cancels, you get a full refund, including the Vendly fee. If you cancel, the refund follows the vendor's cancellation policy (flexible, moderate or strict) and payment schedule, which you see before booking, and any payments not yet due are cancelled.",
  },
  {
    q: "Is Vendly an escrow service?",
    a: "No. Vendly holds payments in its Stripe platform account and releases them to vendors as the work is done. We call this a held payment.",
  },
  {
    q: "Do I need to sign a contract?",
    a: "Yes. Every booking has a contract between you and the vendor, signed in the app, so both sides know exactly what was agreed. Vendly isn't a party to it.",
  },
  {
    q: "When can I download the app?",
    a: "Vendly is coming soon to iPhone and Android. Vendors can list their business now and become founding vendors before launch.",
  },
] as const;

// Fictional sample data for the phone screens. Not real users or businesses.
export const sample = {
  user: "Maya",
  vendor: {
    name: "Glow Studio by Ama",
    category: "Beauty & Glam",
    rating: 4.9,
    reviews: 128,
    city: "Atlanta, GA",
    packages: [
      { name: "Bridal glam", price: 450 },
      { name: "Bridal party (per person)", price: 120 },
    ],
  },
  booking: {
    date: "Sat, Jun 14",
    time: "9:00 AM",
    package: "Bridal glam",
    price: 450,
    note: "Soft glam, warm tones. Getting ready at the Westin, suite 1204.",
  },
  photographer: { name: "Lens & Light Co.", files: 248 },
  planner: {
    event: "Okafor wedding",
    date: "Jun 14",
    budget: 18000,
    booked: 12650,
    vendors: [
      { name: "Glow Studio", role: "Glam", status: "Confirmed" },
      { name: "Bloom & Co", role: "Decor", status: "Proof uploaded" },
      { name: "DJ Kairo", role: "DJ", status: "Signed" },
      { name: "Savor Catering", role: "Catering", status: "Confirmed" },
    ],
  },
  vendorDashboard: {
    business: "Bloom & Co",
    requests: 3,
    upcoming: 5,
    held: 2340,
  },
} as const;

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 });
