import { BookingStatus } from 'prisma/generated/enums';

/** A confirmed booking still not started this long after its start time is flagged to the vendor and Vendly. */
export const NOT_STARTED_FLAG_HOURS = 2;

const HOUR = 60 * 60 * 1000;

/** Its start is the event start, or the scheduled time for bookings without one. */
export const bookingStart = (b: { event_start_at?: Date | string | null; scheduled_at?: Date | string | null }) => {
  const at = b.event_start_at ?? b.scheduled_at;
  return at ? new Date(at) : null;
};

/**
 * True for a confirmed booking whose start time has passed while the vendor never pressed Start:
 * maybe a no-show. The customer can then report a problem (the money stays held) rather than
 * cancel, which pays the vendor under every cancellation policy.
 */
export function pastStartNotStarted(b: { status: BookingStatus | string; event_start_at?: Date | string | null; scheduled_at?: Date | string | null }, now = new Date()) {
  const start = bookingStart(b);
  return b.status === BookingStatus.CONFIRMED && !!start && start.getTime() <= now.getTime();
}

/** Shown with the cancel preview in that case. */
export const NO_SHOW_HINT =
  'The start time has passed and the vendor hasn’t started this booking. If they didn’t show up, report a problem instead: Vendly holds your payment and can refund you. Cancelling now goes by the cancellation policy.';

/**
 * The hour of starts the hourly check flags: confirmed bookings whose start was 2 to 3 hours before
 * the current hour. Whole hours, so each booking falls in exactly one run's window.
 */
export function notStartedWindow(now = new Date()) {
  const hour = Math.floor(now.getTime() / HOUR) * HOUR;
  return { gte: new Date(hour - (NOT_STARTED_FLAG_HOURS + 1) * HOUR), lt: new Date(hour - NOT_STARTED_FLAG_HOURS * HOUR) };
}
