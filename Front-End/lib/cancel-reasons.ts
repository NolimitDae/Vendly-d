/**
 * Why a booking is cancelled: each side picks one (the API's booking/cancel-reasons.ts). The cancel
 * preview sends the list to show; these are the fallback when it can't load. "Customer didn't pay" is
 * left out here: the API offers it only while a payment is overdue.
 */
export interface CancelReason {
  key: string;
  label: string;
}

export const CUSTOMER_CANCEL_REASONS: CancelReason[] = [
  { key: "plans_changed", label: "Plans changed" },
  { key: "found_another_vendor", label: "Found another vendor" },
  { key: "event_cancelled", label: "Event cancelled" },
  { key: "price", label: "Price" },
  { key: "other", label: "Other" },
];

export const VENDOR_CANCEL_REASONS: CancelReason[] = [
  { key: "safety_concern", label: "Safety concern" },
  { key: "emergency", label: "Emergency / can’t make it" },
  { key: "double_booked", label: "Double booked" },
  { key: "other", label: "Other" },
];

/** The vendor's reason that settles like a customer cancellation (the customer keeps nothing of the deposit). */
export const NON_PAYMENT_REASON = "customer_didnt_pay";
