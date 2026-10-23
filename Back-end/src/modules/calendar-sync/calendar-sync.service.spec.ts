import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BookingStatus, UserType } from 'prisma/generated/client';
import { CalendarSyncService, firstName } from './calendar-sync.service';
import { fetchCalendar } from './safe-fetch';

jest.mock('src/config/app.config', () => ({ __esModule: true, default: () => ({ app: { url: 'https://api.test', client_app_url: 'https://app.test' } }) }));
jest.mock('./safe-fetch', () => ({ ...jest.requireActual('./safe-fetch'), fetchCalendar: jest.fn() }));

type Row = { user_id: string; feed_token: string | null; import_url: string | null; last_synced_at: Date | null; last_sync_error: string | null; last_sync_attempt_at: Date | null };

/** Just enough Prisma for the service, keeping calendar_syncs and calendar_busy_blocks in memory. */
function fakePrisma() {
  const syncs = new Map<string, Row>();
  let busy: any[] = [];
  const users: Record<string, any> = {
    vendor: { type: UserType.VENDOR, roles: [UserType.VENDOR], deleted_at: null, status: 1, vendorProfile: { business_name: 'Glow Studio' } },
    other: { type: UserType.VENDOR, roles: [UserType.VENDOR], deleted_at: null, status: 1, vendorProfile: null },
    customer: { type: UserType.CUSTOMER, roles: [UserType.CUSTOMER], deleted_at: null, status: 1 },
  };
  const blank = (user_id: string): Row => ({ user_id, feed_token: null, import_url: null, last_synced_at: null, last_sync_error: null, last_sync_attempt_at: null });
  const prisma = {
    user: { findUnique: jest.fn(async ({ where }) => users[where.id] ?? null) },
    calendarSync: {
      findUnique: jest.fn(async ({ where }) => {
        if (where.user_id) return syncs.get(where.user_id) ?? null;
        return [...syncs.values()].find((r) => r.feed_token === where.feed_token) ?? null;
      }),
      update: jest.fn(async ({ where, data }) => {
        const row = { ...syncs.get(where.user_id)!, ...data };
        syncs.set(where.user_id, row);
        return row;
      }),
      upsert: jest.fn(async ({ where, create }) => {
        if (!syncs.has(where.user_id)) syncs.set(where.user_id, { ...blank(where.user_id), ...create });
        return syncs.get(where.user_id);
      }),
      findMany: jest.fn(async () => [...syncs.values()].filter((r) => r.import_url)),
    },
    calendarBusyBlock: {
      deleteMany: jest.fn(({ where }) => {
        busy = busy.filter((b) => b.user_id !== where.user_id);
        return Promise.resolve({ count: 0 });
      }),
      createMany: jest.fn(({ data }) => {
        busy.push(...data);
        return Promise.resolve({ count: data.length });
      }),
      count: jest.fn(async ({ where }) => busy.filter((b) => b.user_id === where.user_id).length),
    },
    listingAvailability: { findMany: jest.fn(async (_args: any): Promise<any[]> => []), deleteMany: jest.fn() },
    booking: { findMany: jest.fn(async (_args: any): Promise<any[]> => []) },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { prisma, syncs, busy: () => busy };
}

const ICS = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n');
const soon = (days: number) => {
  const d = new Date(Date.now() + days * 864e5);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
};

describe('CalendarSyncService', () => {
  let f: ReturnType<typeof fakePrisma>;
  let service: CalendarSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    f = fakePrisma();
    service = new CalendarSyncService(f.prisma as any);
  });

  describe('feed URL', () => {
    it('creates an unguessable token on first visit and keeps it', async () => {
      const a = await service.getSettings('vendor');
      const b = await service.getSettings('vendor');
      expect(a.data.feed_url).toMatch(/^https:\/\/api\.test\/api\/calendar\/feed\/[A-Za-z0-9_-]{43}\.ics$/);
      expect(b.data.feed_url).toBe(a.data.feed_url);
    });

    it('regenerating replaces the token and the old feed stops working', async () => {
      const before = await service.getSettings('vendor');
      const oldToken = before.data.feed_url!.split('/').pop()!.replace('.ics', '');
      await expect(service.feed(oldToken)).resolves.toContain('BEGIN:VCALENDAR');

      const after = await service.regenerateFeed('vendor');
      const newToken = after.data.feed_url!.split('/').pop()!.replace('.ics', '');
      expect(newToken).not.toBe(oldToken);
      await expect(service.feed(oldToken)).rejects.toThrow(NotFoundException);
      await expect(service.feed(newToken)).resolves.toContain('X-WR-CALNAME:Vendly – Glow Studio');
    });

    it('is only for vendors', async () => {
      await expect(service.getSettings('customer')).rejects.toThrow(ForbiddenException);
      await expect(service.regenerateFeed('customer')).rejects.toThrow(ForbiddenException);
    });

    it('refuses malformed and unknown tokens without leaking anything', async () => {
      await expect(service.feed('../../etc')).rejects.toThrow(NotFoundException);
      await expect(service.feed('A'.repeat(43))).rejects.toThrow(NotFoundException);
    });

    it('lists the vendor’s bookings (customer first name only) and blocked dates, scoped to that vendor', async () => {
      const { data } = await service.getSettings('vendor');
      const token = data.feed_url!.split('/').pop()!.replace('.ics', '');
      f.prisma.booking.findMany.mockResolvedValueOnce([
        { id: 'b1', status: BookingStatus.CONFIRMED, scheduled_at: null, event_start_at: new Date('2026-11-14T18:00:00Z'), event_end_at: new Date('2026-11-14T23:00:00Z'), venue_address: 'The Barn, Austin', guest_count: 120, listing: { title: 'Wedding DJ' }, customer: { first_name: null, name: 'Ada Lovelace' }, rental_reservations: [] },
        { id: 'b2', status: BookingStatus.PENDING, scheduled_at: new Date('2026-11-20T10:00:00Z'), event_start_at: null, event_end_at: null, venue_address: null, guest_count: null, listing: { title: 'Photo booth' }, customer: { first_name: 'Grace', name: 'Grace Hopper' }, rental_reservations: [] },
      ]);
      f.prisma.listingAvailability.findMany.mockResolvedValueOnce([
        { id: 'k1', start_date: new Date('2026-12-24T00:00:00Z'), end_date: new Date('2026-12-26T00:00:00Z'), reason: 'Family', listing: { title: 'Wedding DJ' } },
      ]);
      const ics = await service.feed(token, new Date('2026-10-23T00:00:00Z'));

      const where = f.prisma.booking.findMany.mock.calls[0][0].where;
      expect(where.vendor_id).toBe('vendor');
      expect(where.status.in).toEqual([BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS]);
      expect(f.prisma.listingAvailability.findMany.mock.calls[0][0].where.listing.vendor_id).toBe('vendor');

      expect(ics).toContain('SUMMARY:Wedding DJ – Ada\r\n');
      expect(ics).not.toContain('Lovelace');
      expect(ics).not.toContain('Hopper');
      expect(ics).toContain('LOCATION:The Barn\\, Austin');
      expect(ics).toContain('URL:https://app.test/vendor/bookings/b1');
      expect(ics).toContain('UID:booking-b1@vendly.calendar');
      expect(ics).toContain('SUMMARY:Pending: Photo booth – Grace');
      expect(ics).toContain('STATUS:TENTATIVE');
      expect(ics).toContain('DTSTART;VALUE=DATE:20261224');
      expect(ics).toContain('DTEND;VALUE=DATE:20261227');
    });
  });

  describe('import', () => {
    it('rejects a calendar that fails to load and saves nothing', async () => {
      (fetchCalendar as jest.Mock).mockRejectedValueOnce(new (jest.requireActual('./safe-fetch').CalendarFetchError)('That calendar address points to a private network.'));
      await expect(service.setImportUrl('vendor', 'https://evil.example/cal.ics')).rejects.toThrow(BadRequestException);
      expect(f.syncs.get('vendor')?.import_url ?? null).toBeNull();
      await expect(service.setImportUrl('vendor', 'http://plain.example/cal.ics')).rejects.toThrow(/https/);
    });

    it('stores busy time separately and re-syncing replaces only imported ranges', async () => {
      (fetchCalendar as jest.Mock).mockResolvedValueOnce(ICS(['BEGIN:VEVENT', 'UID:1', `DTSTART;VALUE=DATE:${soon(5)}`, 'END:VEVENT'].join('\r\n'), ['BEGIN:VEVENT', 'UID:2', `DTSTART;VALUE=DATE:${soon(9)}`, 'END:VEVENT'].join('\r\n')));
      const res = await service.setImportUrl('vendor', 'webcal://p01-calendars.icloud.com/published/2/secret');
      expect(res.data.import).toMatchObject({ connected: true, url_hint: 'p01-calendars.icloud.com/…', last_sync_error: null, busy_count: 2 });
      expect(f.syncs.get('vendor')!.import_url).toBe('https://p01-calendars.icloud.com/published/2/secret');

      (fetchCalendar as jest.Mock).mockResolvedValueOnce(ICS(['BEGIN:VEVENT', 'UID:3', `DTSTART;VALUE=DATE:${soon(20)}`, 'END:VEVENT'].join('\r\n')));
      const again = await service.syncNow('vendor');
      expect(again.data.import.busy_count).toBe(1);
      expect(f.busy()).toEqual([expect.objectContaining({ user_id: 'vendor', all_day: true })]);
      // manual blocks are never touched
      expect(f.prisma.listingAvailability.deleteMany).not.toHaveBeenCalled();
    });

    it('keeps the last good busy time and records the error when a sync fails', async () => {
      (fetchCalendar as jest.Mock).mockResolvedValueOnce(ICS(['BEGIN:VEVENT', 'UID:1', `DTSTART;VALUE=DATE:${soon(5)}`, 'END:VEVENT'].join('\r\n')));
      await service.setImportUrl('vendor', 'https://calendar.google.com/calendar/ical/x/private-abc/basic.ics');
      (fetchCalendar as jest.Mock).mockRejectedValueOnce(new (jest.requireActual('./safe-fetch').CalendarFetchError)('The calendar took too long to respond.'));
      const res = await service.syncNow('vendor');
      expect(res.data.import.last_sync_error).toBe('The calendar took too long to respond.');
      expect(res.data.import.last_synced_at).toBeInstanceOf(Date);
      expect(f.busy()).toHaveLength(1);
    });

    it('hourly sync goes through every connected vendor', async () => {
      (fetchCalendar as jest.Mock).mockResolvedValue(ICS());
      await service.setImportUrl('vendor', 'https://a.example/1.ics');
      await service.setImportUrl('other', 'https://b.example/2.ics');
      (fetchCalendar as jest.Mock).mockClear();
      await expect(service.syncAll()).resolves.toEqual({ total: 2, ok: 2 });
      expect(fetchCalendar).toHaveBeenCalledTimes(2);
    });

    it('removing the import frees the imported dates', async () => {
      (fetchCalendar as jest.Mock).mockResolvedValueOnce(ICS(['BEGIN:VEVENT', 'UID:1', `DTSTART;VALUE=DATE:${soon(5)}`, 'END:VEVENT'].join('\r\n')));
      await service.setImportUrl('vendor', 'https://a.example/1.ics');
      const res = await service.removeImport('vendor');
      expect(res.data.import.connected).toBe(false);
      expect(f.busy()).toEqual([]);
    });

    it('sync now needs a connected calendar', async () => {
      await expect(service.syncNow('vendor')).rejects.toThrow(BadRequestException);
    });
  });

  it('takes the first name only', () => {
    expect(firstName({ first_name: null, name: '  Ada  Lovelace ' })).toBe('Ada');
    expect(firstName({ first_name: 'Grace', name: 'Grace Hopper' })).toBe('Grace');
    expect(firstName(null)).toBe('');
  });
});
