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
  paid_at?: string | null;
  release_at?: string | null;
  released_at?: string | null;
  customer_approved_at?: string | null;
  dispute: { opened_at: string; resolved_at?: string | null } | null;
  installments: Installment[];
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
  dispute: (bookingId: string, reason: string) => api.post(`/bookings/${bookingId}/dispute`, { reason }),
  retry: (bookingId: string, installmentId: string, paymentMethodId?: string) =>
    api.post<{ success: boolean; data: Installment }>(`/bookings/${bookingId}/installments/${installmentId}/retry`, paymentMethodId ? { payment_method_id: paymentMethodId } : {}),
};
