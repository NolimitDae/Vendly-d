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
  brand?: string;
  last4?: string;
  exp_month?: number;
  exp_year?: number;
  is_default: boolean;
}

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
}

export interface PaymentTimeline {
  plan: PaymentPlan | null;
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
  installments: Installment[];
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

export const PaymentsService = {
  setupIntent: () => Fetch.post("/payments/setup-intent", {}, authHeaders()),
  cards: () => Fetch.get("/payments/methods", authHeaders()),
  setDefault: (id: string) => Fetch.patch(`/payments/methods/${id}/default`, {}, authHeaders()),
  removeCard: (id: string) => Fetch.delete(`/payments/methods/${id}`, authHeaders()),

  timeline: (bookingId: string) => Fetch.get(`/bookings/${bookingId}/payments`, authHeaders()),
  approve: (bookingId: string) => Fetch.post(`/bookings/${bookingId}/approve`, {}, authHeaders()),
  dispute: (bookingId: string, reason: string) => Fetch.post(`/bookings/${bookingId}/dispute`, { reason }, authHeaders()),
  retry: (bookingId: string, installmentId: string, paymentMethodId?: string) =>
    Fetch.post(`/bookings/${bookingId}/installments/${installmentId}/retry`, paymentMethodId ? { payment_method_id: paymentMethodId } : {}, authHeaders()),
};
