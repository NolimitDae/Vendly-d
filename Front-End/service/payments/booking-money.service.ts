import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

/** GET /bookings/:id/cancel-preview, and `refund_summary` on the cancel response. */
export interface CancellationSummary {
  cancelled_by: "CUSTOMER" | "VENDOR";
  refund_total: number;
  refund_fee: number;
  fee_kept: number;
  vendor_keeps: number;
  policy: { key: string; label: string; text: string } | null;
  percent: number;
  unpaid_cancelled: number;
  holds_released: number;
  /** "Visa •••• 4242" when known */
  card: string | null;
  refund_timing: string | null;
  /** plain sentence for whoever asked */
  message: string;
}

export type TransactionType = "payment" | "refund" | "payout" | "fee";
export type TransactionStatus = "completed" | "pending" | "failed" | "refunded";

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
  data: TransactionRow[];
  meta: { total: number; page: number; limit: number; last_page: number; role: "customer" | "vendor" };
  totals: { in: number; out: number };
}

export interface TransactionsQuery {
  type?: "all" | TransactionType;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  limit?: number;
  role?: "customer" | "vendor";
}

/** Cancel previews, final invoices and the transaction history. */
export const BookingMoneyService = {
  cancelPreview: (bookingId: string) => Fetch.get(`/bookings/${bookingId}/cancel-preview`, authHeaders()),

  /** The final invoice PDF as a Blob (customer, vendor or admin). */
  invoice: async (bookingId: string): Promise<Blob> => {
    const res = await Fetch.get(`/bookings/${bookingId}/invoice`, { ...authHeaders(), responseType: "blob" });
    return res.data as Blob;
  },

  transactions: (params: TransactionsQuery = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "" && v !== "all") query.set(k, String(v));
    });
    return Fetch.get(`/payments/transactions?${query.toString()}`, authHeaders());
  },
};

/** Saves the invoice PDF through the browser's download. */
export async function downloadInvoice(bookingId: string) {
  const blob = await BookingMoneyService.invoice(bookingId);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vendly-invoice-${bookingId.slice(-8).toUpperCase()}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const money = (n: number, currency = "usd") => {
  const body = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const text = currency.toLowerCase() === "usd" ? `$${body}` : `${currency.toUpperCase()} ${body}`;
  return n < 0 ? `−${text}` : text;
};
