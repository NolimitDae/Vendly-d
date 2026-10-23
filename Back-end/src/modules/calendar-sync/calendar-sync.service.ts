import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { BookingStatus, UserType } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import appConfig from 'src/config/app.config';
import { withJobLock } from 'src/common/helper/job-lock';
import { buildCalendar, FEED_UID_DOMAIN, IcsEvent } from './ics';
import { parseIcs } from './ics-parse';
import { CalendarFetchError, fetchCalendar, normalizeCalendarUrl } from './safe-fetch';

const DAY = 24 * 60 * 60 * 1000;
/** Bookings that ended within this long still show, so the vendor's calendar keeps recent history. */
const FEED_HISTORY_DAYS = 30;
/** How far ahead imported busy time is read. */
const IMPORT_MONTHS = 12;
const FEED_STATUSES = [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS];
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** 32 random bytes, URL-safe (43 characters). */
export function newFeedToken(): string {
  return randomBytes(32).toString('base64url');
}

/** First name only: the feed may end up on shared calendars. */
export function firstName(customer: { first_name?: string | null; name?: string | null } | null | undefined): string {
  const raw = customer?.first_name?.trim() || customer?.name?.trim() || '';
  return raw.split(/\s+/)[0] ?? '';
}

/** Host and a hint of the path, never the secret part. */
function maskUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return `${normalizeCalendarUrl(url).hostname}/…`;
  } catch {
    return '…';
  }
}

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Vendor settings ───────────────────────────────────────────────────────

  private async assertVendor(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { type: true, roles: true, deleted_at: true } });
    if (!user || user.deleted_at) throw new NotFoundException('Account not found');
    if (user.type !== UserType.VENDOR && !(user.roles ?? []).includes(UserType.VENDOR)) {
      throw new ForbiddenException('Calendar sync is for vendor accounts.');
    }
  }

  /** The vendor's sync row, created with a feed token on first use. */
  private async syncRow(userId: string) {
    const existing = await this.prisma.calendarSync.findUnique({ where: { user_id: userId } });
    if (existing?.feed_token) return existing;
    if (existing) return this.prisma.calendarSync.update({ where: { user_id: userId }, data: { feed_token: newFeedToken() } });
    return this.prisma.calendarSync.upsert({ where: { user_id: userId }, create: { user_id: userId, feed_token: newFeedToken() }, update: {} });
  }

  feedUrl(token: string) {
    const base = appConfig().app.url ?? `http://localhost:${process.env.PORT ?? 4000}`;
    return `${base}/api/calendar/feed/${token}.ics`;
  }

  private async view(row: { user_id: string; feed_token: string | null; import_url: string | null; last_synced_at: Date | null; last_sync_error: string | null; last_sync_attempt_at: Date | null }) {
    const busy_count = row.import_url ? await this.prisma.calendarBusyBlock.count({ where: { user_id: row.user_id, end_date: { gte: new Date(isoDay(new Date())) } } }) : 0;
    return {
      success: true,
      data: {
        feed_url: row.feed_token ? this.feedUrl(row.feed_token) : null,
        import: {
          connected: !!row.import_url,
          url_hint: maskUrl(row.import_url),
          last_synced_at: row.last_synced_at,
          last_sync_attempt_at: row.last_sync_attempt_at,
          last_sync_error: row.last_sync_error,
          busy_count,
        },
      },
    };
  }

  async getSettings(userId: string) {
    await this.assertVendor(userId);
    return this.view(await this.syncRow(userId));
  }

  /** New feed address; the old one stops working straight away. */
  async regenerateFeed(userId: string) {
    await this.assertVendor(userId);
    await this.syncRow(userId);
    const row = await this.prisma.calendarSync.update({ where: { user_id: userId }, data: { feed_token: newFeedToken() } });
    return this.view(row);
  }

  /** Saves the calendar to import from, after checking it loads. */
  async setImportUrl(userId: string, rawUrl: string) {
    await this.assertVendor(userId);
    let url: string;
    let ranges: Awaited<ReturnType<CalendarSyncService['readCalendar']>>;
    try {
      url = normalizeCalendarUrl(rawUrl).toString();
      ranges = await this.readCalendar(url);
    } catch (e) {
      throw new BadRequestException(this.message(e));
    }
    await this.syncRow(userId);
    await this.replaceBusy(userId, ranges);
    const row = await this.prisma.calendarSync.update({
      where: { user_id: userId },
      data: { import_url: url, last_synced_at: new Date(), last_sync_attempt_at: new Date(), last_sync_error: null },
    });
    return this.view(row);
  }

  async syncNow(userId: string) {
    await this.assertVendor(userId);
    const row = await this.prisma.calendarSync.findUnique({ where: { user_id: userId } });
    if (!row?.import_url) throw new BadRequestException('Add a calendar to import first.');
    await this.syncOne(userId, row.import_url);
    return this.view(await this.syncRow(userId));
  }

  /** Stops importing and frees the dates it blocked. */
  async removeImport(userId: string) {
    await this.assertVendor(userId);
    await this.syncRow(userId);
    await this.prisma.calendarBusyBlock.deleteMany({ where: { user_id: userId } });
    const row = await this.prisma.calendarSync.update({
      where: { user_id: userId },
      data: { import_url: null, last_synced_at: null, last_sync_error: null, last_sync_attempt_at: null },
    });
    return this.view(row);
  }

  // ─── Import ────────────────────────────────────────────────────────────────

  private message(e: unknown) {
    if (e instanceof CalendarFetchError) return e.message;
    const msg = (e as Error)?.message ?? '';
    return /iCalendar/.test(msg) ? msg : 'Couldn’t read that calendar. Check the address and try again.';
  }

  private async readCalendar(url: string) {
    const text = await fetchCalendar(url);
    const now = new Date();
    return parseIcs(text, {
      from: new Date(now.getTime() - DAY),
      to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + IMPORT_MONTHS, now.getUTCDate())),
      skipUidSuffix: `@${FEED_UID_DOMAIN}`,
    });
  }

  /** Imported busy time is replaced as a whole; manual blocks (ListingAvailability) are never touched. */
  private async replaceBusy(userId: string, ranges: Awaited<ReturnType<CalendarSyncService['readCalendar']>>) {
    await this.prisma.$transaction([
      this.prisma.calendarBusyBlock.deleteMany({ where: { user_id: userId } }),
      this.prisma.calendarBusyBlock.createMany({
        data: ranges.map((r) => ({
          user_id: userId,
          start_at: r.start,
          end_at: r.end,
          start_date: new Date(`${r.startDate}T00:00:00.000Z`),
          end_date: new Date(`${r.endDate}T00:00:00.000Z`),
          all_day: r.allDay,
        })),
      }),
    ]);
  }

  /** One vendor's re-sync. A failed fetch keeps the busy time from the last good sync and records the error. */
  async syncOne(userId: string, url: string) {
    const attempt = new Date();
    try {
      const ranges = await this.readCalendar(url);
      await this.replaceBusy(userId, ranges);
      await this.prisma.calendarSync.update({ where: { user_id: userId }, data: { last_synced_at: attempt, last_sync_attempt_at: attempt, last_sync_error: null } });
      return true;
    } catch (e) {
      this.logger.warn(`calendar sync ${userId}: ${(e as Error).message}`);
      await this.prisma.calendarSync.update({ where: { user_id: userId }, data: { last_sync_attempt_at: attempt, last_sync_error: this.message(e) } });
      return false;
    }
  }

  /** Hourly: re-reads every connected calendar. */
  @Cron(CronExpression.EVERY_HOUR)
  cronSync() {
    return withJobLock(this.prisma, 'calendar-import-sync', () => this.syncAll());
  }

  async syncAll() {
    const rows = await this.prisma.calendarSync.findMany({ where: { import_url: { not: null } }, select: { user_id: true, import_url: true } });
    let ok = 0;
    for (const r of rows) if (await this.syncOne(r.user_id, r.import_url!)) ok++;
    return { total: rows.length, ok };
  }

  // ─── Feed ──────────────────────────────────────────────────────────────────

  /** The .ics for a feed token; unknown or revoked tokens are simply not found. */
  async feed(token: string, now = new Date()): Promise<string> {
    if (!TOKEN_RE.test(token)) throw new NotFoundException();
    const row = await this.prisma.calendarSync.findUnique({ where: { feed_token: token }, select: { user_id: true } });
    if (!row) throw new NotFoundException();
    const vendor = await this.prisma.user.findUnique({
      where: { id: row.user_id },
      select: { deleted_at: true, status: true, vendorProfile: { select: { business_name: true } } },
    });
    if (!vendor || vendor.deleted_at || vendor.status === 0) throw new NotFoundException();

    const since = new Date(now.getTime() - FEED_HISTORY_DAYS * DAY);
    const [bookings, blocks] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          vendor_id: row.user_id,
          deleted_at: null,
          status: { in: FEED_STATUSES },
          OR: [
            { event_end_at: { gte: since } },
            { event_start_at: { gte: since } },
            { scheduled_at: { gte: since } },
            { rental_reservations: { some: { end_date: { gte: since } } } },
          ],
        },
        select: {
          id: true,
          status: true,
          scheduled_at: true,
          event_start_at: true,
          event_end_at: true,
          venue_address: true,
          guest_count: true,
          listing: { select: { title: true } },
          customer: { select: { first_name: true, name: true } },
          rental_reservations: { select: { start_date: true, end_date: true, item: { select: { title: true } } } },
        },
        orderBy: { created_at: 'asc' },
        take: 1000,
      }),
      this.prisma.listingAvailability.findMany({
        where: { end_date: { gte: new Date(isoDay(since)) }, listing: { vendor_id: row.user_id, deleted_at: null } },
        select: { id: true, start_date: true, end_date: true, reason: true, listing: { select: { title: true } } },
        orderBy: { start_date: 'asc' },
        take: 1000,
      }),
    ]);

    const client = appConfig().app.client_app_url;
    const events: IcsEvent[] = [];
    for (const b of bookings) {
      const service = b.listing?.title ?? (b.rental_reservations.length ? this.rentalTitle(b.rental_reservations) : 'Booking');
      const who = firstName(b.customer);
      const pending = b.status === BookingStatus.PENDING;
      const link = `${client}/vendor/bookings/${b.id}`;
      const base: IcsEvent = {
        uid: `booking-${b.id}@${FEED_UID_DOMAIN}`,
        summary: `${pending ? 'Pending: ' : ''}${service}${who ? ` – ${who}` : ''}`,
        location: b.venue_address,
        description: [pending ? 'Booking request awaiting your reply.' : null, b.guest_count ? `Guests: ${b.guest_count}` : null, `View on Vendly: ${link}`].filter(Boolean).join('\n'),
        url: link,
        status: pending ? 'TENTATIVE' : 'CONFIRMED',
      };
      const start = b.event_start_at ?? b.scheduled_at;
      if (start) {
        const end = b.event_end_at && b.event_end_at > start ? b.event_end_at : undefined;
        if ((end ?? start) < since) continue;
        events.push({ ...base, start, end });
      } else if (b.rental_reservations.length) {
        const first = b.rental_reservations.reduce((m, r) => (r.start_date < m ? r.start_date : m), b.rental_reservations[0].start_date);
        const last = b.rental_reservations.reduce((m, r) => (r.end_date > m ? r.end_date : m), b.rental_reservations[0].end_date);
        events.push({ ...base, startDate: isoDay(first), endDate: isoDay(last) });
      }
    }
    for (const blk of blocks) {
      events.push({
        uid: `block-${blk.id}@${FEED_UID_DOMAIN}`,
        summary: `Blocked on Vendly: ${blk.listing.title}`,
        description: blk.reason ?? null,
        startDate: isoDay(blk.start_date),
        endDate: isoDay(blk.end_date),
        status: 'CONFIRMED',
      });
    }

    const business = vendor.vendorProfile?.business_name?.trim();
    return buildCalendar(events, { name: business ? `Vendly – ${business}` : 'Vendly bookings', now });
  }

  private rentalTitle(reservations: { item: { title: string } }[]) {
    const first = reservations[0].item.title;
    return reservations.length > 1 ? `${first} + ${reservations.length - 1} more` : first;
  }
}
