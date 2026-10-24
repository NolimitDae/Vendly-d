import { format, parseISO } from 'date-fns';

/**
 * A deposit-plan booking whose deposit or balance didn't go through shows "Pending deposit" /
 * "Pending balance" (the API's payment_state) until it's paid or, 12 hours later, cancelled.
 */
export type PaymentState = 'pending_deposit' | 'pending_balance';

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  pending_deposit: 'Pending deposit',
  pending_balance: 'Pending balance',
};

/** "7:30 PM on Sat, Oct 24" in the phone's time zone. */
export const dueByText = (at: string) => format(parseISO(at), "h:mm a 'on' EEE, MMM d");

/** Deposit plans: the deposit isn't refunded when the customer cancels or a payment isn't made in time (docs/PAYMENTS.md). */
export const isDepositPlan = (plan?: string | null) => plan === 'DEPOSIT_50' || plan === 'DEPOSIT_25';
export const DEPOSIT_RULE_TEXT =
  "The deposit is non-refundable if you cancel, or if a payment isn't made within 12 hours of failing (the booking is then cancelled). Anything paid beyond the deposit is refunded under the cancellation policy.";

/**
 * Why a booking is cancelled: each side picks one (the API's booking/cancel-reasons.ts). The cancel
 * preview sends the list to show; these are the fallback when it can't load. "Customer didn't pay" is
 * left out: the API offers it only while a payment is overdue.
 */
export interface CancelReason {
  key: string;
  label: string;
}

export const CUSTOMER_CANCEL_REASONS: CancelReason[] = [
  { key: 'plans_changed', label: 'Plans changed' },
  { key: 'found_another_vendor', label: 'Found another vendor' },
  { key: 'event_cancelled', label: 'Event cancelled' },
  { key: 'price', label: 'Price' },
  { key: 'other', label: 'Other' },
];

export const VENDOR_CANCEL_REASONS: CancelReason[] = [
  { key: 'safety_concern', label: 'Safety concern' },
  { key: 'emergency', label: 'Emergency / can’t make it' },
  { key: 'double_booked', label: 'Double booked' },
  { key: 'other', label: 'Other' },
];

export const NON_PAYMENT_REASON = 'customer_didnt_pay';

/** "The vendor cancelled: Double booked. “Took another job”" for a cancelled booking, or null. */
export function cancellationLine(
  b: { cancelled_by?: string | null; cancel_reason_label?: string | null; cancel_reason?: string | null },
  viewer: 'CUSTOMER' | 'VENDOR',
): string | null {
  const by =
    b.cancelled_by === 'SYSTEM'
      ? "Cancelled by Vendly: the payment wasn't made in time"
      : b.cancelled_by === 'ADMIN'
        ? 'Cancelled by Vendly'
        : b.cancelled_by === viewer
          ? 'You cancelled'
          : b.cancelled_by === 'VENDOR'
            ? 'The vendor cancelled'
            : b.cancelled_by === 'CUSTOMER'
              ? 'The customer cancelled'
              : null;
  const head = [by, b.cancel_reason_label].filter(Boolean).join(': ');
  const note = b.cancel_reason?.trim();
  if (!head) return note || null;
  return note ? `${head}. “${note}”` : head;
}
