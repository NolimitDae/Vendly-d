/**
 * Why a booking was cancelled. Customers and vendors each pick one from their own list (with an
 * optional note); a booking whose deposit or balance wasn't paid in time is cancelled by the system
 * with "non_payment". The apps show these labels; the codes are stored on the booking.
 */

export const CUSTOMER_CANCEL_REASONS = {
  plans_changed: 'Plans changed',
  found_another_vendor: 'Found another vendor',
  event_cancelled: 'Event cancelled',
  price: 'Price',
  other: 'Other',
} as const;

export const VENDOR_CANCEL_REASONS = {
  customer_didnt_pay: 'Customer didn’t pay',
  safety_concern: 'Safety concern',
  emergency: 'Emergency / can’t make it',
  double_booked: 'Double booked',
  other: 'Other',
} as const;

/** Set by the job that cancels a booking whose deposit or balance wasn't paid within the deadline. */
export const NON_PAYMENT = 'non_payment';

export type CancelledBy = 'CUSTOMER' | 'VENDOR' | 'SYSTEM' | 'ADMIN';

export const ALL_CANCEL_REASON_CODES = [...new Set([...Object.keys(CUSTOMER_CANCEL_REASONS), ...Object.keys(VENDOR_CANCEL_REASONS)])];

/** The reasons each side may pick. */
export function cancelReasonsFor(by: 'CUSTOMER' | 'VENDOR'): Record<string, string> {
  return by === 'VENDOR' ? VENDOR_CANCEL_REASONS : CUSTOMER_CANCEL_REASONS;
}

/** "Plans changed"; null for bookings cancelled before reasons were picked. */
export function cancelReasonLabel(code: string | null | undefined, by?: string | null): string | null {
  if (!code) return null;
  if (code === NON_PAYMENT) return 'Payment not made in time';
  const list: Record<string, string> = by === 'VENDOR' ? VENDOR_CANCEL_REASONS : by === 'CUSTOMER' ? CUSTOMER_CANCEL_REASONS : { ...CUSTOMER_CANCEL_REASONS, ...VENDOR_CANCEL_REASONS };
  return list[code] ?? null;
}

/** "Cancelled by the vendor: Double booked. Note: ..." for emails, the invoice and admin views. */
export function describeCancelReason(b: { cancelled_by?: string | null; cancel_reason_code?: string | null; cancel_reason?: string | null }): string | null {
  const label = cancelReasonLabel(b.cancel_reason_code, b.cancelled_by);
  const note = b.cancel_reason?.trim() || null;
  if (!label) return note;
  return note ? `${label}. ${note}` : label;
}

/**
 * A vendor's cancellation for their own reasons, which Vendly tracks: not because the customer
 * didn't pay, not a safety concern, and never the system's non-payment cancellations.
 */
export const UNTRACKED_VENDOR_REASONS = ['customer_didnt_pay', 'safety_concern', NON_PAYMENT];

export function countsAgainstVendor(by: string | null | undefined, code: string | null | undefined) {
  return by === 'VENDOR' && !UNTRACKED_VENDOR_REASONS.includes(code ?? '');
}
