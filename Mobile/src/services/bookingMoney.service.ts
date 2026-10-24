import { api } from './api';

/** GET /bookings/:id/cancel-preview, and `refund_summary` on the cancel response. */
export interface CancellationSummary {
  cancelled_by: 'CUSTOMER' | 'VENDOR';
  refund_total: number;
  refund_fee: number;
  fee_kept: number;
  vendor_keeps: number;
  /** deposit plans: the paid deposit the vendor keeps (non-refundable when the customer cancels or didn't pay) */
  deposit_kept?: number;
  policy: { key: string; label: string; text: string } | null;
  percent: number;
  unpaid_cancelled: number;
  holds_released: number;
  /** "Visa •••• 4242" when known */
  card: string | null;
  refund_timing: string | null;
  /** plain sentence for whoever asked */
  message: string;
  /** preview only: the start time passed and the vendor never started, so Report a problem fits better */
  report_problem_hint?: string;
  /** preview only: the reasons this person can pick ("Customer didn't pay" only while a payment is overdue) */
  reasons?: { key: string; label: string }[];
}

export type TransactionType = 'payment' | 'refund' | 'payout' | 'fee';
export type TransactionStatus = 'completed' | 'pending' | 'failed' | 'refunded';

/** One row of GET /payments/transactions (amount: + money in, − money out). */
export interface TransactionRow {
  id: string;
  date: string;
  type: TransactionType;
  kind: string;
  description: string;
  booking_id: string | null;
  booking_title: string | null;
  amount: number;
  currency: string;
  status: TransactionStatus;
}

export interface TransactionsPage {
  success: boolean;
  data: TransactionRow[];
  meta: { total: number; page: number; limit: number; last_page: number; role: 'customer' | 'vendor' };
  totals: { in: number; out: number };
}

/** Cancel previews, final invoices and the transaction history. */
export const BookingMoneyService = {
  /** `reasonCode`: the vendor's "customer_didnt_pay" previews a non-payment cancellation (settled like the customer's). */
  cancelPreview: (bookingId: string, reasonCode?: string) =>
    api.get<{ success: boolean; data: CancellationSummary }>(`/bookings/${bookingId}/cancel-preview`, { params: reasonCode ? { reason_code: reasonCode } : undefined }),

  /** Cancels with the reason picked (and an optional note); the response carries `refund_summary`. */
  cancel: (bookingId: string, body: { reason_code: string; note?: string }) =>
    api.patch<{ success: boolean; data: { refund_summary?: CancellationSummary | null } }>(`/bookings/${bookingId}/cancel`, body),

  /** A five-minute link to the final invoice PDF that opens without the login header (use openSignedLink). */
  invoiceLink: (bookingId: string) => api.get<{ success: boolean; data: { url: string } }>(`/bookings/${bookingId}/invoice/link`),

  transactions: (params: { role: 'customer' | 'vendor'; type?: 'all' | TransactionType; q?: string; page?: number; limit?: number }) =>
    api.get<TransactionsPage>('/payments/transactions', {
      params: { ...params, type: params.type && params.type !== 'all' ? params.type : undefined, q: params.q || undefined },
    }),
};

export const money = (n: number, currency = 'usd') => {
  const body = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const text = currency.toLowerCase() === 'usd' ? `$${body}` : `${currency.toUpperCase()} ${body}`;
  return n < 0 ? `−${text}` : text;
};

/** COMPLETED or CANCELLED with something paid: the invoice is final. */
export const invoiceAvailable = (b: { status: string; paid_at?: string | null }) => !!b.paid_at && (b.status === 'COMPLETED' || b.status === 'CANCELLED');
