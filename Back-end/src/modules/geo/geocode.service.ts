import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingStatus } from 'prisma/generated/client';
import { withJobLock } from 'src/common/helper/job-lock';
import { PrismaService } from 'src/prisma/prisma.service';
import { geocode } from './geo';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bookings whose venue is still worth putting on a map (the day hasn't been and gone). */
const OPEN_BOOKINGS: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS];

/** Keeps listing, booking venue and vendor business address coordinates in step with their text. */
@Injectable()
export class GeocodeService {
  private readonly logger = new Logger(GeocodeService.name);

  constructor(private prisma: PrismaService) {}

  /** Geocodes one listing now (called right after it is saved). Never throws. */
  async listing(listingId: string) {
    try {
      const l = await this.prisma.vendorListing.findUnique({ where: { id: listingId }, select: { location: true } });
      if (!l) return;
      const point = l.location ? await geocode(l.location) : null;
      await this.prisma.vendorListing.update({ where: { id: listingId }, data: { lat: point?.lat ?? null, lng: point?.lng ?? null, geocoded_at: new Date() } });
    } catch (e) {
      // leave geocoded_at empty so the hourly backfill retries it
      this.logger.warn(`geocode ${listingId}: ${(e as Error).message}`);
    }
  }

  /**
   * Puts a booking's venue on the map (called in the background after a request or an address change,
   * so the request never waits on the geocoder). Never throws.
   */
  async booking(bookingId: string) {
    try {
      const b = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { venue_address: true } });
      if (!b) return;
      const point = b.venue_address ? await geocode(b.venue_address) : null;
      // only if the address is still the one looked up (it may have been changed meanwhile)
      await this.prisma.booking.updateMany({
        where: { id: bookingId, venue_address: b.venue_address },
        data: { venue_lat: point?.lat ?? null, venue_lng: point?.lng ?? null, venue_geocoded_at: new Date() },
      });
    } catch (e) {
      // leave venue_geocoded_at empty so the hourly backfill retries it
      this.logger.warn(`geocode booking ${bookingId}: ${(e as Error).message}`);
    }
  }

  /** Puts a vendor's private business address on the map (after they save it). Never throws. */
  async businessAddress(userId: string) {
    try {
      const p = await this.prisma.vendorProfile.findUnique({ where: { user_id: userId }, select: { business_address: true } });
      if (!p) return;
      const point = p.business_address ? await geocode(p.business_address) : null;
      await this.prisma.vendorProfile.updateMany({
        where: { user_id: userId, business_address: p.business_address },
        data: { business_lat: point?.lat ?? null, business_lng: point?.lng ?? null, business_geocoded_at: new Date() },
      });
    } catch (e) {
      this.logger.warn(`geocode business address ${userId}: ${(e as Error).message}`);
    }
  }

  /** Hourly: anything with an address but no coordinates yet (new, edited, or failed before). */
  @Cron(CronExpression.EVERY_HOUR)
  cronBackfill() {
    return withJobLock(this.prisma, 'geocode-backfill', () => this.backfill());
  }

  async backfill(limit = 40) {
    const todo = await this.prisma.vendorListing.findMany({
      where: { geocoded_at: null, location: { not: null }, deleted_at: null },
      select: { id: true },
      take: limit,
    });
    for (const t of todo) {
      await this.listing(t.id);
      await sleep(1100); // the free geocoder allows one request a second
    }
    let done = todo.length;
    // then booking venues and business addresses, within the same budget
    if (done < limit) {
      const bookings = await this.prisma.booking.findMany({
        where: { venue_geocoded_at: null, venue_address: { not: null }, deleted_at: null, status: { in: OPEN_BOOKINGS } },
        select: { id: true },
        take: limit - done,
      });
      for (const b of bookings) {
        await this.booking(b.id);
        await sleep(1100);
      }
      done += bookings.length;
    }
    if (done < limit) {
      const profiles = await this.prisma.vendorProfile.findMany({
        where: { business_geocoded_at: null, business_address: { not: null } },
        select: { user_id: true },
        take: limit - done,
      });
      for (const p of profiles) {
        await this.businessAddress(p.user_id);
        await sleep(1100);
      }
      done += profiles.length;
    }
    return done;
  }
}
