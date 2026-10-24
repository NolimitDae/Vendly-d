/** Hours a vendor has to accept or decline a request before it's declined for them. */
export const REQUEST_EXPIRY_HOURS = 72;
/** The vendor is reminded this many hours before the request expires. */
export const EXPIRY_REMINDER_HOURS = 24;
/** "How was it?" goes out this long after a booking is completed, if there's no review yet. */
export const REVIEW_REMINDER_HOURS = 48;
/** Customers are asked to review bookings completed in the last this-many days. */
export const REVIEW_WINDOW_DAYS = 30;

const HOUR = 60 * 60 * 1000;

/** A request is always open at least this long, however close the event is. */
export const MIN_OPEN_HOURS = 2;

const isMidnightUtc = (d: Date) => d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;

/**
 * When an unanswered request is declined automatically: 72 hours after the vendor could first
 * answer it, or when the event starts if that's sooner (a request can't still be open once the
 * event has begun). Date-only starts (rental pickups are stored as the day at 00:00 UTC) count
 * from the end of that day, and every request stays open at least a couple of hours.
 */
export function requestExpiresAt(booking: {
  created_at: Date | string;
  request_opened_at?: Date | string | null;
  event_start_at?: Date | string | null;
}): Date {
  const opened = new Date(booking.request_opened_at ?? booking.created_at).getTime();
  const byAge = opened + REQUEST_EXPIRY_HOURS * HOUR;
  if (!booking.event_start_at) return new Date(byAge);
  const start = new Date(booking.event_start_at);
  const byStart = isMidnightUtc(start) ? start.getTime() + 24 * HOUR : start.getTime();
  return new Date(Math.min(byAge, Math.max(byStart, opened + MIN_OPEN_HOURS * HOUR)));
}

export const hoursFromNow = (h: number, now = new Date()) => new Date(now.getTime() + h * HOUR);

/** A planner's request waiting for their client's co-signature, with no event date, closes this long after it was made. */
export const CLIENT_SIGN_DAYS = 14;

/**
 * When a request still waiting for the planner's client to co-sign is closed: when the event
 * starts (date-only starts count from the end of that day), or 14 days after the request without a date.
 */
export function clientSignExpiresAt(booking: { created_at: Date | string; event_start_at?: Date | string | null }): Date {
  if (!booking.event_start_at) return new Date(new Date(booking.created_at).getTime() + CLIENT_SIGN_DAYS * 24 * HOUR);
  const start = new Date(booking.event_start_at);
  return isMidnightUtc(start) ? new Date(start.getTime() + 24 * HOUR) : start;
}
