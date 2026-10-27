import { BookingStatus } from 'prisma/generated/client';
import { localDay } from 'src/modules/calendar-sync/busy-days';
import type { PrismaService } from 'src/prisma/prisma.service';
import { needsServiceAddress, type PlaceRulesListing } from './booking-place';

/**
 * The "Upcoming booking" tracker: who can see whose phone number and address, and the vendor's day-of
 * steps (On my way, Arrived, Customer arrived). The steps are only for showing progress: Start and
 * Complete (status IN_PROGRESS / COMPLETED) stay the authority for money, payouts and cancellations.
 */

/** Where a package happens. */
export const SERVICE_AT = ['CUSTOMER_LOCATION', 'VENDOR_LOCATION'] as const;
export type ServiceAt = (typeof SERVICE_AT)[number];

/** How long after a booking is done the two sides can still see each other's number. */
export const CONTACT_WINDOW_DAYS = 3;
const DAY = 24 * 3600 * 1000;

/**
 * Whether the customer and the vendor see each other's phone number (and, for packages at the vendor's
 * place, the vendor's business address): once the booking is accepted, while it runs, and for a few days
 * after it is done. Never on a request, a declined or a cancelled booking.
 */
export function contactRevealed(b: { status: BookingStatus | string; completed_at?: Date | string | null }, now = new Date()): boolean {
  if (b.status === BookingStatus.CONFIRMED || b.status === BookingStatus.IN_PROGRESS) return true;
  if (b.status !== BookingStatus.COMPLETED || !b.completed_at) return false;
  return now.getTime() - new Date(b.completed_at).getTime() <= CONTACT_WINDOW_DAYS * DAY;
}

/**
 * Where a booking happens (rentals and older packages: at the customer's venue). A venue is booked for
 * its own place, so it counts as the vendor's place whatever the package says; so does a booking where the
 * customer chose to come to the vendor (or pick up a rental).
 */
export function serviceAtOf(b: { listing?: PlaceRulesListing | null; customer_comes?: boolean | null }): ServiceAt {
  if (b.customer_comes) return 'VENDOR_LOCATION';
  return needsServiceAddress(b.listing) ? 'CUSTOMER_LOCATION' : 'VENDOR_LOCATION';
}

export type TrackerStep = 'en_route' | 'arrived' | 'check_in';
export const STEP_FIELD = { en_route: 'en_route_at', arrived: 'arrived_at', check_in: 'checked_in_at' } as const;

/** The vendor's day-of steps open on the booking's day, or the day before, where the customer is. */
export function stepsOpen(start: Date | null | undefined, now = new Date(), timeZone?: string | null): boolean {
  if (!start) return false;
  return localDay(now, timeZone).getTime() >= localDay(start, timeZone).getTime() - DAY;
}

interface StepBooking {
  status: BookingStatus | string;
  listing?: PlaceRulesListing | null;
  customer_comes?: boolean | null;
  rental_reservations?: unknown[] | null;
  event_start_at?: Date | null;
  scheduled_at?: Date | null;
  en_route_at?: Date | null;
  arrived_at?: Date | null;
  checked_in_at?: Date | null;
}

/**
 * Whether a step can be taken: 'done' when it (or a later step) already happened, so asking again
 * changes nothing; 'ok' to record it now; or the reason it can't be taken.
 */
export function stepCheck(b: StepBooking, step: TrackerStep, now = new Date(), timeZone?: string | null): 'ok' | 'done' | { error: string } {
  // asking again (a double tap, a retry) is fine; steps only move forward
  if (b[STEP_FIELD[step]]) return 'done';
  if (step === 'en_route' && b.arrived_at) return 'done';
  // before the job (on its day) and during it: arriving is recorded before the booking can be completed
  if (b.status !== BookingStatus.CONFIRMED && b.status !== BookingStatus.IN_PROGRESS) return { error: 'These steps are for accepted bookings that aren’t finished yet.' };
  if (b.rental_reservations?.length) return { error: 'Rentals don’t have day-of steps.' };
  const at = serviceAtOf(b);
  if (step === 'check_in' && at !== 'VENDOR_LOCATION') return { error: 'You go to the customer for this booking. Use On my way and Arrived.' };
  if (step !== 'check_in' && at !== 'CUSTOMER_LOCATION') return { error: 'The customer comes to you for this booking. Use Customer arrived.' };
  if (b.status === BookingStatus.CONFIRMED && !stepsOpen(b.event_start_at ?? b.scheduled_at, now, timeZone)) return { error: 'You can do this on the day of the booking, or the day before.' };
  return 'ok';
}

/**
 * Before a booking can be completed the vendor records the arrival: Arrived when they go to the
 * customer, Customer arrived when the customer comes to them. Rentals have no day-of steps.
 * Returns the message to show, or null when completing is fine.
 */
export function arrivalMissing(b: Omit<StepBooking, 'status'>): string | null {
  if (b.rental_reservations?.length) return null;
  if (serviceAtOf(b) === 'VENDOR_LOCATION') return b.checked_in_at ? null : 'Tap Customer arrived first, then mark the booking completed.';
  return b.arrived_at ? null : 'Tap Arrived first, then mark the booking completed.';
}

/** The customer's time zone for a booking, as saved with its contract (UTC when unknown). */
export async function bookingTimeZone(prisma: PrismaService, bookingId: string): Promise<string | undefined> {
  const contract = await prisma.bookingContract.findFirst({ where: { booking_id: bookingId }, orderBy: { version: 'desc' }, select: { merge_data: true } });
  return (contract?.merge_data as Record<string, unknown> | null)?.timezone as string | undefined;
}

/**
 * What the booking page adds for the tracker: where it happens, the other side's phone number and, for
 * packages at the vendor's place, the vendor's business address. The number and address are only
 * loaded while contactRevealed allows, so they never leave the server otherwise.
 */
export async function trackerDetails(
  prisma: PrismaService,
  booking: { id: string; status: BookingStatus | string; completed_at?: Date | null; customer_id: string; vendor_id: string; listing?: PlaceRulesListing | null; customer_comes?: boolean | null; event_start_at?: Date | null; scheduled_at?: Date | null; rental_reservations?: unknown[] | null },
  viewerId: string,
  now = new Date(),
) {
  const serviceAt = serviceAtOf(booking);
  const revealed = contactRevealed(booking, now);
  const isCustomer = viewerId === booking.customer_id;
  const [other, place] = revealed
    ? await Promise.all([
        prisma.user.findUnique({ where: { id: isCustomer ? booking.vendor_id : booking.customer_id }, select: { phone_number: true } }),
        isCustomer && serviceAt === 'VENDOR_LOCATION'
          ? prisma.vendorProfile.findUnique({ where: { user_id: booking.vendor_id }, select: { business_address: true, business_lat: true, business_lng: true } })
          : null,
      ])
    : [null, null];
  // the vendor's day-of buttons show on the booking's day (or the day before) where the customer is
  // (and while the job is under way, so the arrival can be recorded before completing)
  const stepsDay =
    isCustomer || booking.rental_reservations?.length
      ? false
      : booking.status === BookingStatus.IN_PROGRESS
        ? true
        : booking.status === BookingStatus.CONFIRMED
          ? stepsOpen(booking.event_start_at ?? booking.scheduled_at, now, await bookingTimeZone(prisma, booking.id))
          : false;
  return {
    service_at: serviceAt,
    contact_revealed: revealed,
    // the other side's number: the vendor's for the customer, the customer's for the vendor
    contact_phone: other?.phone_number?.trim() || null,
    // packages at the vendor's place, and customers coming to the vendor: where the customer goes
    vendor_place: place?.business_address ? { address: place.business_address, lat: place.business_lat, lng: place.business_lng } : null,
    steps_open: stepsDay,
  };
}
