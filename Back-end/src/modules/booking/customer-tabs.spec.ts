import { BookingStatus } from 'prisma/generated/client';
import { BookingService } from './booking.service';
import { customerTabOrder, customerTabWhere } from './customer-tabs';

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({ TanvirStorage: { url: jest.fn((p: string) => `https://cdn.test/${p}`) } }));

const now = new Date('2030-06-01T12:00:00Z');

function setup() {
  const prisma: any = { booking: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) } };
  const none: any = {};
  return { service: new BookingService(prisma, none, none, none, none, none, none, none), prisma };
}

describe('Customer bookings tabs', () => {
  it('Pending: requests waiting for the vendor', () => {
    expect(customerTabWhere('pending', now)).toEqual({ status: BookingStatus.PENDING });
  });

  it('Upcoming: confirmed and not started (or no date yet)', () => {
    expect(customerTabWhere('upcoming', now)).toEqual({
      status: BookingStatus.CONFIRMED,
      OR: [{ event_start_at: { gt: now } }, { event_start_at: null, scheduled_at: { gt: now } }, { event_start_at: null, scheduled_at: null }],
    });
  });

  it('Active: in progress, or confirmed and its start time has come', () => {
    expect(customerTabWhere('active', now)).toEqual({
      OR: [
        { status: BookingStatus.IN_PROGRESS },
        { status: BookingStatus.CONFIRMED, OR: [{ event_start_at: { lte: now } }, { event_start_at: null, scheduled_at: { lte: now } }] },
      ],
    });
  });

  it('Complete: completed, cancelled, declined and expired', () => {
    expect(customerTabWhere('complete', now)).toEqual({ status: { in: [BookingStatus.COMPLETED, BookingStatus.CANCELLED, BookingStatus.REJECTED] } });
  });

  it('lists a tab soonest first, with paging', async () => {
    const { service, prisma } = setup();
    await service.getMyBookingsAsCustomer('c1', { tab: 'upcoming', page: 2, limit: 5 });
    const args = prisma.booking.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ customer_id: 'c1', deleted_at: null });
    expect(args.where.AND[0]).toMatchObject({ status: BookingStatus.CONFIRMED });
    expect(args.orderBy).toEqual(customerTabOrder('upcoming'));
    expect(args.skip).toBe(5);
  });

  it('without a tab the list is unchanged', async () => {
    const { service, prisma } = setup();
    await service.getMyBookingsAsCustomer('c1', { status: BookingStatus.COMPLETED });
    const args = prisma.booking.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ customer_id: 'c1', status: 'COMPLETED', deleted_at: null });
    expect(args.orderBy).toEqual([{ created_at: 'desc' }]);
  });
});
