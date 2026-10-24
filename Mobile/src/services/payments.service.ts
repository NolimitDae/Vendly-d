import { api } from './api';

export interface SavedCard {
  id: string;
  brand?: string;
  last4?: string;
  exp_month?: number;
  exp_year?: number;
  is_default: boolean;
}

export type PaymentPlan = 'FULL_ON_ACCEPT' | 'DEPOSIT_50' | 'DEPOSIT_25' | 'PAY_AFTER_SERVICE';
export type InstallmentStatus = 'SCHEDULED' | 'PROCESSING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';

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
  /** money off or refunded by the vendor */
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
  installments: Installment[];
}

export type DisputeCategory = 'no_show' | 'late' | 'not_as_described' | 'quality' | 'damage' | 'billing' | 'other';
export type DisputeOutcome = 'full_refund' | 'partial_refund' | 'other';

export const DISPUTE_CATEGORY_LABELS: Record<DisputeCategory, string> = {
  no_show: 'Vendor didn’t show up',
  late: 'Vendor was late',
  not_as_described: 'Not as described',
  quality: 'Poor quality',
  damage: 'Damage',
  billing: 'Billing problem',
  other: 'Something else',
};

export const DISPUTE_OUTCOME_LABELS: Record<DisputeOutcome, string> = {
  full_refund: 'Full refund',
  partial_refund: 'Partial refund',
  other: 'Something else',
};

export const DISPUTE_MAX_PHOTOS = 10;

export interface DisputeReport {
  reason: string;
  category?: DisputeCategory;
  outcome?: DisputeOutcome;
  requested_amount?: number;
  photos?: { uri: string; name: string; type: string }[];
}

/** "Partial refund of $50.00" */
export function disputeOutcomeText(outcome?: string | null, amount?: number | string | null) {
  if (!outcome) return null;
  const base = DISPUTE_OUTCOME_LABELS[outcome as DisputeOutcome] ?? outcome;
  return outcome === 'partial_refund' && amount != null && amount !== '' ? `${base} of $${Number(amount).toFixed(2)}` : base;
}

export const PLAN_LABELS: Record<PaymentPlan, string> = {
  FULL_ON_ACCEPT: 'Full payment when the vendor accepts',
  DEPOSIT_50: '50% deposit when the vendor accepts, balance 7 days before',
  DEPOSIT_25: '25% deposit when the vendor accepts, balance 14 days before',
  PAY_AFTER_SERVICE: 'Card held at the event, charged after the service',
};

export const PaymentsService = {
  setupIntent: () => api.post<{ success: boolean; data: { client_secret: string } }>('/payments/setup-intent'),
  cards: () => api.get<{ success: boolean; data: SavedCard[] }>('/payments/methods'),
  setDefault: (id: string) => api.patch(`/payments/methods/${id}/default`),
  removeCard: (id: string) => api.delete(`/payments/methods/${id}`),

  timeline: (bookingId: string) => api.get<{ success: boolean; data: PaymentTimeline }>(`/bookings/${bookingId}/payments`),
  approve: (bookingId: string) => api.post(`/bookings/${bookingId}/approve`),
  releaseDeposit: (bookingId: string) => api.post(`/bookings/${bookingId}/release-deposit`),
  /** Report a problem. Details and photos go as multipart, so the longer upload timeout applies. */
  dispute: (bookingId: string, report: string | DisputeReport) => {
    if (typeof report === 'string') return api.post(`/bookings/${bookingId}/dispute`, { reason: report });
    const form = new FormData();
    form.append('reason', report.reason);
    if (report.category) form.append('category', report.category);
    if (report.outcome) form.append('outcome', report.outcome);
    if (report.outcome === 'partial_refund' && report.requested_amount != null) form.append('requested_amount', String(report.requested_amount));
    (report.photos ?? []).forEach((p) => form.append('photos', p as any));
    return api.post(`/bookings/${bookingId}/dispute`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  retry: (bookingId: string, installmentId: string, paymentMethodId?: string) =>
    api.post<{ success: boolean; data: Installment }>(`/bookings/${bookingId}/installments/${installmentId}/retry`, paymentMethodId ? { payment_method_id: paymentMethodId } : {}),
};
