/**
 * The status label and colour a booking shows in lists and on its page. A deposit-plan booking whose
 * deposit or balance didn't go through shows "Pending deposit" / "Pending balance" (the API's
 * payment_state) until it's paid or, 12 hours later, cancelled.
 */
export interface StatusFields {
  status: string;
  expired_at?: string | null;
  payment_state?: "pending_deposit" | "pending_balance" | null;
}

const PAYMENT_STATE_LABELS = { pending_deposit: "Pending deposit", pending_balance: "Pending balance" } as const;

export const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  CONFIRMED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  IN_PROGRESS: "bg-blush-100 text-plum-700 dark:bg-plum-900/30 dark:text-orchid-300",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  CANCELLED: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
  REJECTED: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};
const PAYMENT_DUE_COLOR = "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";

/** The badge text, in capitals like the other badges: "PENDING DEPOSIT", "EXPIRED", "DECLINED", "IN PROGRESS"… */
export function bookingStatusLabel(b: StatusFields): string {
  if (b.payment_state && PAYMENT_STATE_LABELS[b.payment_state]) return PAYMENT_STATE_LABELS[b.payment_state].toUpperCase();
  if (b.status === "REJECTED") return b.expired_at ? "EXPIRED" : "DECLINED";
  return b.status.replace("_", " ");
}

/** "Pending deposit" in a sentence. */
export const paymentStateText = (state: StatusFields["payment_state"]) => (state ? PAYMENT_STATE_LABELS[state] : null);

export function bookingStatusColor(b: StatusFields): string {
  if (b.payment_state) return PAYMENT_DUE_COLOR;
  return STATUS_COLORS[b.status] ?? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
}

/** "7:30 PM on Sat, Oct 24" in the viewer's own time zone. */
export function dueByText(at: string | Date): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${time} on ${day}`;
}

/** "The vendor cancelled: Double booked. “Took another job”" for a cancelled booking, or null. */
export function cancellationLine(
  b: { cancelled_by?: string | null; cancel_reason_label?: string | null; cancel_reason?: string | null },
  viewer: "CUSTOMER" | "VENDOR" | "ADMIN",
): string | null {
  const head = [cancelledByText(b.cancelled_by, viewer), b.cancel_reason_label].filter(Boolean).join(": ");
  const note = b.cancel_reason?.trim();
  if (!head) return note || null;
  return note ? `${head}. “${note}”` : head;
}

/** Who cancelled, in the viewer's words. */
export function cancelledByText(by: string | null | undefined, viewer: "CUSTOMER" | "VENDOR" | "ADMIN"): string | null {
  if (by === "SYSTEM") return "Cancelled by Vendly: the payment wasn't made in time";
  if (by === "ADMIN") return "Cancelled by Vendly";
  if (by === "CUSTOMER") return viewer === "CUSTOMER" ? "You cancelled" : "The customer cancelled";
  if (by === "VENDOR") return viewer === "VENDOR" ? "You cancelled" : "The vendor cancelled";
  return null;
}
