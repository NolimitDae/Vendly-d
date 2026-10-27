import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export interface SavedCard {
  id: string;
  /** "card", or "us_bank_account" for a saved bank account (listed with cards({ bank: true })) */
  type?: "card" | "us_bank_account";
  brand?: string;
  last4?: string;
  exp_month?: number;
  exp_year?: number;
  bank_name?: string | null;
  is_default: boolean;
}

export const isBankAccount = (m?: { type?: string } | null) => m?.type === "us_bank_account";

export type PaymentPlan = "FULL_ON_ACCEPT" | "DEPOSIT_50" | "DEPOSIT_25" | "PAY_AFTER_SERVICE";
export type InstallmentStatus = "SCHEDULED" | "PROCESSING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";

export interface Installment {
  id: string;
  sequence: number;
  label: string;
  amount: number;
  fee_amount: number;
  due_at: string;
  status: InstallmentStatus;
  paid_at?: string | null;
  attempts: number;
  next_attempt_at?: string | null;
  last_error?: string | null;
  refunded_amount: number;
  /** a bank payment on its way: shown as Processing until it clears (about 4 business days) */
  clearing?: boolean;
  clearing_since?: string | null;
  by_bank?: boolean;
}

export interface PaymentTimeline {
  plan: PaymentPlan | null;
  /** deposit plans: a missed deposit or balance to pay by payment_due_by, or the booking is cancelled */
  payment_state?: "pending_deposit" | "pending_balance" | null;
  payment_due_by?: string | null;
  currency: string;
  total: number;
  paid: number;
  outstanding: number;
  /** money the vendor gave back (lowered what was owed or refunded) */
  given_back?: number;
  paid_at?: string | null;
  release_at?: string | null;
  released_at?: string | null;
  customer_approved_at?: string | null;
  dispute: { opened_at: string; resolved_at?: string | null } | null;
  /** the customer can report a problem now (older APIs leave it out) */
  can_dispute?: boolean;
  /** confirmed, its start time has passed and the vendor never started: maybe a no-show */
  not_started?: boolean;
  /** the vendor's part of what was paid: a partial refund asked for stays under it */
  vendor_paid?: number | null;
  /** bank payments still clearing */
  processing?: number;
  /** total at or above Admin → Settings' large booking amount: 48 hours to fix a failed payment */
  large?: boolean;
  payment_due_hours?: number;
  /** a bank account can pay for this booking */
  bank_allowed?: boolean;
  paying_by_bank?: boolean;
  refunded?: number;
  refund_by_bank?: boolean;
  installments: Installment[];
}

/** How long a bank payment takes to clear, for the wording. */
export const BANK_CLEARING_TEXT = "about 4 business days";

export type DisputeCategory = "no_show" | "late" | "not_as_described" | "quality" | "damage" | "billing" | "other";
export type DisputeOutcome = "full_refund" | "partial_refund" | "other";

export const DISPUTE_CATEGORY_LABELS: Record<DisputeCategory, string> = {
  no_show: "Vendor didn’t show up",
  late: "Vendor was late",
  not_as_described: "Not as described",
  quality: "Poor quality",
  damage: "Damage",
  billing: "Billing problem",
  other: "Something else",
};

export const DISPUTE_OUTCOME_LABELS: Record<DisputeOutcome, string> = {
  full_refund: "Full refund",
  partial_refund: "Partial refund",
  other: "Something else",
};

export const DISPUTE_MAX_PHOTOS = 10;

export interface DisputeReport {
  reason: string;
  category?: DisputeCategory;
  outcome?: DisputeOutcome;
  requested_amount?: number;
  photos?: File[];
}

export interface ScheduleLine {
  label: string;
  amount: number;
  due_at: string;
  capture_manually: boolean;
}

export const PLAN_LABELS: Record<PaymentPlan, string> = {
  FULL_ON_ACCEPT: "Full payment when the vendor accepts",
  DEPOSIT_50: "50% deposit when the vendor accepts, balance 7 days before the event",
  DEPOSIT_25: "25% deposit when the vendor accepts, balance 14 days before the event",
  PAY_AFTER_SERVICE: "Card held at the event, charged after the service",
};

/** Deposit plans: the deposit isn't refunded when the customer cancels or a payment isn't made in time (docs/PAYMENTS.md). */
export const isDepositPlan = (plan?: string | null) => plan === "DEPOSIT_50" || plan === "DEPOSIT_25";
/** "$5,000" (cents only when there are some). */
export const wholeMoney = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

/** The deposit rule, with the large booking deadline when there is one (Admin → Settings, $5,000 by default). */
export const depositRuleText = (largeFrom: number | null | undefined = 5000) =>
  `The deposit is non-refundable if you cancel, or if a payment isn't made within 12 hours of failing${largeFrom ? ` (48 hours on bookings of ${wholeMoney(largeFrom)} or more)` : ""} (the booking is then cancelled). Anything paid beyond the deposit is refunded under the cancellation policy.`;
export const DEPOSIT_RULE_TEXT = depositRuleText();

/** The fee and large booking rules the apps word things with (GET /payment-settings). */
export interface PaymentSettings {
  fee_percent: number;
  fee_minimum: number;
  fee_maximum: number | null;
  large_payment_threshold: number | null;
  payment_due_hours: number;
  large_payment_due_hours: number;
}
export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = { fee_percent: 5, fee_minimum: 3, fee_maximum: 500, large_payment_threshold: 5000, payment_due_hours: 12, large_payment_due_hours: 48 };

/** "5%, up to $500" (or "5%" with no cap). */
export const feeRuleText = (s: Pick<PaymentSettings, "fee_percent" | "fee_maximum"> = DEFAULT_PAYMENT_SETTINGS) =>
  `${s.fee_percent}%${s.fee_maximum ? `, up to ${wholeMoney(s.fee_maximum)}` : ""}`;

export const PaymentsService = {
  /** A card form's client secret, or with "us_bank_account" one for connecting a bank account. */
  setupIntent: (type?: "us_bank_account") => Fetch.post("/payments/setup-intent", type ? { type } : {}, authHeaders()),
  /** Saved cards; with bank, saved bank accounts too. */
  cards: (opts: { bank?: boolean } = {}) => Fetch.get(opts.bank ? "/payments/methods?bank=1" : "/payments/methods", authHeaders()),
  paymentSettings: () => Fetch.get("/payment-settings"),
  setDefault: (id: string) => Fetch.patch(`/payments/methods/${id}/default`, {}, authHeaders()),
  removeCard: (id: string) => Fetch.delete(`/payments/methods/${id}`, authHeaders()),

  timeline: (bookingId: string) => Fetch.get(`/bookings/${bookingId}/payments`, authHeaders()),
  approve: (bookingId: string) => Fetch.post(`/bookings/${bookingId}/approve`, {}, authHeaders()),
  /** Report a problem: details and up to 10 photos go as multipart (the upload timeout applies). */
  dispute: (bookingId: string, report: string | DisputeReport) => {
    if (typeof report === "string") return Fetch.post(`/bookings/${bookingId}/dispute`, { reason: report }, authHeaders());
    const form = new FormData();
    form.append("reason", report.reason);
    if (report.category) form.append("category", report.category);
    if (report.outcome) form.append("outcome", report.outcome);
    if (report.outcome === "partial_refund" && report.requested_amount != null) form.append("requested_amount", String(report.requested_amount));
    (report.photos ?? []).forEach((p) => form.append("photos", p));
    return Fetch.post(`/bookings/${bookingId}/dispute`, form, { headers: { Authorization: `Bearer ${CookieHelper.get({ key: "token" })}` } });
  },
  retry: (bookingId: string, installmentId: string, paymentMethodId?: string) =>
    Fetch.post(`/bookings/${bookingId}/installments/${installmentId}/retry`, paymentMethodId ? { payment_method_id: paymentMethodId } : {}, authHeaders()),
};
