import type { Booking } from '../services/booking.service';

/**
 * The customer's bookings tabs, the same rules as the API's `tab` filter (Back-end customer-tabs.ts):
 * pending = waiting for the vendor; upcoming = confirmed, not started; active = in progress, or
 * confirmed and its start time has come; complete = done, cancelled, declined or expired.
 */
export type CustomerTab = 'active' | 'upcoming' | 'pending' | 'complete';

export function customerTabOf(b: Pick<Booking, 'status' | 'event_start_at' | 'scheduled_at'>, now = new Date()): CustomerTab {
  if (b.status === 'PENDING') return 'pending';
  if (b.status === 'IN_PROGRESS') return 'active';
  if (b.status === 'CONFIRMED') {
    const start = b.event_start_at ?? b.scheduled_at;
    return start && new Date(start) <= now ? 'active' : 'upcoming';
  }
  return 'complete';
}
