import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { PushService } from 'src/modules/push/push.service';
import { rentalTitle } from 'src/modules/rentals/rentals.service';
import { BookingService } from './booking.service';
import { bookingTimeZone, STEP_FIELD, stepCheck, type TrackerStep } from './booking-tracker';

/** The customer's push for a step (none for check-in: the customer is the one arriving). */
const STEP_PUSH: Partial<Record<TrackerStep, (vendor: string, title: string) => { title: string; body: string }>> = {
  en_route: (vendor, title) => ({ title: 'On the way', body: `${vendor} is on the way for ${title}` }),
  arrived: (vendor, title) => ({ title: 'Your vendor has arrived', body: `${vendor} has arrived for ${title}` }),
};

@Injectable()
export class BookingTrackerService {
  constructor(
    private prisma: PrismaService,
    private pushService: PushService,
    private bookings: BookingService,
  ) {}

  /**
   * The vendor records a day-of step (On my way, Arrived, Customer arrived). Only the booking's vendor,
   * only forward, and asking again changes nothing. Status and money are untouched.
   */
  async step(bookingId: string, vendorId: string, step: TrackerStep, now = new Date()) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, deleted_at: null },
      select: {
        id: true, vendor_id: true, customer_id: true, status: true, event_start_at: true, scheduled_at: true,
        en_route_at: true, arrived_at: true, checked_in_at: true,
        listing: { select: { title: true, service_at: true } },
        rental_reservations: { select: { id: true, quantity: true, item: { select: { title: true } } } },
        vendor: { select: { name: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.vendor_id !== vendorId) throw new ForbiddenException('Access denied');

    const check = stepCheck(booking, step, now, await bookingTimeZone(this.prisma, bookingId));
    if (typeof check === 'object') throw new BadRequestException(check.error);
    if (check === 'ok') {
      const field = STEP_FIELD[step];
      // only while still accepted and not yet recorded: a cancellation or a double tap in the meantime wins
      const moved = await this.prisma.booking.updateMany({
        where: { id: bookingId, status: BookingStatus.CONFIRMED, [field]: null },
        data: { [field]: now },
      });
      if (moved.count === 1) {
        const push = STEP_PUSH[step];
        const title = booking.listing?.title ?? (booking.rental_reservations.length ? rentalTitle(booking.rental_reservations as any) : 'your booking');
        // push + inbox + the live bell (which also refreshes an open booking page); respects the
        // customer's booking-updates setting like the other booking pushes, and never emails
        if (push) {
          void this.pushService.sendToUser(booking.customer_id, { ...push(booking.vendor?.name ?? 'Your vendor', title), data: { type: 'booking', bookingId } }, 'booking_updates');
        }
      } else {
        const fresh = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { [field]: true } as any });
        if (!(fresh as any)?.[field]) throw new BadRequestException('This booking changed in the meantime. Refresh and try again.');
      }
    }
    return this.bookings.getBooking(bookingId, vendorId);
  }
}
