import { BookingStatus, InstallmentStatus } from 'prisma/generated/enums';
import { DashboardBooking, earnedOn, monthKeyOf, monthKeys, readZone, summariseEarnings } from './dashboard-stats';
import { VendorDashboardService } from './dashboard.service';

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({ TanvirStorage: { url: (p: string) => `https://cdn.test/${p}` } }));

const inst = (over: Record<string, unknown> = {}) => ({
  status: InstallmentStatus.PAID,
  amount: 110,
  fee_amount: 10,
  refunded_amount: 0,
  paid_out_at: null as Date | null,
  ...over,
});

let n = 0;
const booking = (over: Partial<DashboardBooking> = {}): DashboardBooking => ({
  id: `b${++n}`,
  status: BookingStatus.COMPLETED,
  amount: 200,
  paid_at: new Date('2026-08-01T10:00:00Z'),
  released_at: null,
  payout_credited_at: null,
  cancelled_at: null,
  created_at: new Date('2026-07-20T10:00:00Z'),
  commission_amount: null,
  released_gross: null,
  early_released_amount: 0,
  installments: [],
  customer_id: 'c1',
  customer: { id: 'c1', name: 'Ada', avatar: null },
  ...over,
});

// released with 10% commission: $200 vendor part, $20 commission, $180 earned
const released = (at: string, over: Partial<DashboardBooking> = {}) =>
  booking({
    released_at: new Date(at),
    commission_amount: 20,
    released_gross: 200,
    installments: [inst({ paid_out_at: new Date(at) }), inst({ paid_out_at: new Date(at) })],
    ...over,
  });

const now = new Date('2026-10-24T12:00:00Z');

describe('dashboard months', () => {
  it('lists the last N months, oldest first, ending this month', () => {
    expect(monthKeys(3, now)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(monthKeys(12, now)[0]).toBe('2025-11');
    expect(monthKeys(2, new Date('2026-01-15T00:00:00Z'))).toEqual(['2025-12', '2026-01']);
  });

  it('uses the vendor’s time zone for month boundaries', () => {
    // 8pm on Oct 31 in Los Angeles is already November in UTC
    const d = new Date('2026-11-01T03:00:00Z');
    expect(monthKeyOf(d)).toBe('2026-11');
    expect(monthKeyOf(d, 'America/Los_Angeles')).toBe('2026-10');
    expect(readZone('Not/AZone')).toBeUndefined();
    expect(readZone('America/Chicago')).toBe('America/Chicago');
  });

  it('dates earnings when they reached the vendor', () => {
    const b = booking({ released_at: new Date('2026-09-02T00:00:00Z'), cancelled_at: new Date('2026-09-05T00:00:00Z') });
    expect(earnedOn(b)).toEqual(new Date('2026-09-02T00:00:00Z'));
    expect(earnedOn(booking({ cancelled_at: new Date('2026-09-05T00:00:00Z') }))).toEqual(new Date('2026-09-05T00:00:00Z'));
    expect(earnedOn(booking())).toEqual(new Date('2026-08-01T10:00:00Z'));
  });
});

describe('earned by month and top clients', () => {
  const keys = monthKeys(3, now);

  it('uses the payout maths: after commission, refunds taken off', () => {
    const res = summariseEarnings(
      [
        released('2026-10-03T00:00:00Z'),
        // $50 refunded after the payout: 135 earned (see vendor-earnings.spec)
        released('2026-09-10T00:00:00Z', { installments: [inst({ paid_out_at: now, refunded_amount: 50 }), inst({ paid_out_at: now })] }),
      ],
      keys,
    );
    expect(res.revenue_by_month).toEqual([
      { month: '2026-08', label: 'Aug', earned: 0 },
      { month: '2026-09', label: 'Sep', earned: 135 },
      { month: '2026-10', label: 'Oct', earned: 180 },
    ]);
    expect(res.total_earned).toBe(315);
  });

  it('leaves out held money, nothing-earned bookings and months outside the window', () => {
    const res = summariseEarnings(
      [
        // paid but not released yet: held, not earned
        booking({ status: BookingStatus.CONFIRMED, installments: [inst()] }),
        // fully refunded cancellation
        booking({ status: BookingStatus.CANCELLED, cancelled_at: new Date('2026-10-01T00:00:00Z'), installments: [inst({ status: InstallmentStatus.REFUNDED, refunded_amount: 110 })] }),
        released('2026-06-01T00:00:00Z'),
      ],
      keys,
    );
    expect(res.total_earned).toBe(0);
    expect(res.top_clients).toEqual([]);
  });

  it('counts what a cancellation left the vendor in the month it was cancelled', () => {
    const res = summariseEarnings(
      [booking({ status: BookingStatus.CANCELLED, cancelled_at: new Date('2026-09-20T00:00:00Z'), installments: [inst({ refunded_amount: 60 })] })],
      keys,
    );
    expect(res.revenue_by_month.find((m) => m.month === '2026-09')!.earned).toBe(40);
  });

  it('ranks the top 5 clients by what the vendor earned from them', () => {
    const client = (id: string, name: string) => ({ customer_id: id, customer: { id, name, avatar: null } });
    const list = [
      released('2026-10-01T00:00:00Z', client('c1', 'Ada')),
      released('2026-10-02T00:00:00Z', client('c2', 'Bo')),
      released('2026-10-03T00:00:00Z', client('c2', 'Bo')),
      ...['c3', 'c4', 'c5', 'c6'].map((id, i) =>
        released('2026-09-01T00:00:00Z', { ...client(id, id), commission_amount: 0, installments: [inst({ paid_out_at: now, amount: 10 + i * 10, fee_amount: 0 })] }),
      ),
    ];
    const top = summariseEarnings(list, keys).top_clients;
    expect(top.map((c) => c.id)).toEqual(['c2', 'c1', 'c6', 'c5', 'c4']);
    expect(top[0]).toEqual({ id: 'c2', name: 'Bo', avatar: null, earned: 360, bookings: 2 });
  });
});

describe('VendorDashboardService.stats', () => {
  const setup = () => {
    const prisma: any = {
      booking: {
        groupBy: jest.fn().mockResolvedValue([
          { status: BookingStatus.COMPLETED, _count: { _all: 3 } },
          { status: BookingStatus.PENDING, _count: { _all: 2 } },
        ]),
        count: jest.fn().mockResolvedValue(4),
        findMany: jest.fn().mockResolvedValue([released('2026-10-03T00:00:00Z', { customer: { id: 'c1', name: 'Ada', avatar: 'a.jpg' } })]),
      },
      review: { aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.666 }, _count: { _all: 3 } }) },
    };
    return { prisma, service: new VendorDashboardService(prisma) };
  };

  it('puts the dashboard together from database counts and the earnings', async () => {
    const { service } = setup();
    const { data } = await service.stats('v1', { months: 3 }, now);
    expect(data.revenue_by_month.map((m) => m.earned)).toEqual([0, 0, 180]);
    expect(data.bookings).toEqual({
      total: 5,
      by_status: { PENDING: 2, CONFIRMED: 0, IN_PROGRESS: 0, COMPLETED: 3, CANCELLED: 0, REJECTED: 0 },
      upcoming: 4,
    });
    expect(data.rating).toEqual({ average: 4.7, count: 3 });
    expect(data.top_clients).toEqual([expect.objectContaining({ id: 'c1', earned: 180, bookings: 1, avatar_url: expect.stringContaining('a.jpg') })]);
    expect(data.top_clients[0]).not.toHaveProperty('avatar');
  });

  it('only reads this vendor’s bookings from the window, and caps the months', async () => {
    const { prisma, service } = setup();
    const { data } = await service.stats('v1', { months: 99, tz: 'Bad/Zone' }, now);
    expect(data.months).toBe(24);
    expect(data.timezone).toBe('UTC');
    const where = prisma.booking.findMany.mock.calls[0][0].where;
    expect(where.vendor_id).toBe('v1');
    // a day before Nov 1 2024 (24 months back)
    expect(where.OR[0]).toEqual({ released_at: { gte: new Date('2024-10-31T00:00:00Z') } });
    expect(prisma.review.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { vendor_id: 'v1', deleted_at: null } }));
  });

  it('has no rating until there are reviews', async () => {
    const { prisma, service } = setup();
    prisma.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });
    expect((await service.stats('v1', {}, now)).data.rating).toEqual({ average: null, count: 0 });
  });
});
