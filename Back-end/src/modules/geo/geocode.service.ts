import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { withJobLock } from 'src/common/helper/job-lock';
import { PrismaService } from 'src/prisma/prisma.service';
import { geocode } from './geo';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Keeps listing coordinates in step with their location text. */
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

  /** Hourly: listings that have a location but no coordinates yet (new, edited, or failed before). */
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
    return todo.length;
  }
}
