/** Hours a vendor has to accept or decline a request before it's declined for them. */
export const REQUEST_EXPIRY_HOURS = 72;
/** The vendor is reminded this many hours before the request expires. */
export const EXPIRY_REMINDER_HOURS = 24;
/** "How was it?" goes out this long after a booking is completed, if there's no review yet. */
export const REVIEW_REMINDER_HOURS = 48;
/** Customers are asked to review bookings completed in the last this-many days. */
export const REVIEW_WINDOW_DAYS = 30;

const HOUR = 60 * 60 * 1000;

/**
 * When an unanswered request is declined automatically: 72 hours after it was sent, or when the
 * event starts if that's sooner (a request can't still be open once the event has begun).
 */
export function requestExpiresAt(booking: { created_at: Date | string; event_start_at?: Date | string | null }): Date {
  const byAge = new Date(new Date(booking.created_at).getTime() + REQUEST_EXPIRY_HOURS * HOUR);
  const start = booking.event_start_at ? new Date(booking.event_start_at) : null;
  return start && start < byAge ? start : byAge;
}

export const hoursFromNow = (h: number, now = new Date()) => new Date(now.getTime() + h * HOUR);
