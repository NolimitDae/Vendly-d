import { SignedUrl } from 'src/modules/contracts/private-storage';
import { BookingService } from './booking.service';

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({ TanvirStorage: { url: jest.fn((p: string) => `https://cdn.test/${p}`) } }));

const row = (over: Record<string, unknown> = {}) => ({
  id: 'b1', customer_id: 'c1', vendor_id: 'v1', status: 'COMPLETED', created_at: new Date(), customer: null, vendor: null, listing: null, rental_reservations: [],
  dispute_photos: ['disputes/b1/a.jpg', 'disputes/b1/b.png'],
  ...over,
});

function setup() {
  const prisma: any = {
    booking: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([row()]), findFirst: jest.fn().mockResolvedValue(row()) },
    paymentTransaction: { findMany: jest.fn().mockResolvedValue([{ reference_number: 'b9' }]), groupBy: jest.fn().mockResolvedValue([{ reference_number: 'b1', _sum: { amount: '25.00' } }]) },
    bookingInstallment: { groupBy: jest.fn().mockResolvedValue([{ booking_id: 'b1', _sum: { refunded_amount: '60.50' } }]) },
  };
  const none: any = {};
  return { service: new BookingService(prisma, none, none, none, none, none, none, none), prisma };
}

describe('Vendor bookings: Refunds and Complaints tabs', () => {
  it('Refunds: bookings with a refund on any charge, or money the vendor gave back', async () => {
    const { service, prisma } = setup();
    const res = await service.getMyBookingsAsVendor('v1', { filter: 'refunds' });
    expect(res.data[0]).toMatchObject({ refunded_total: 60.5, given_back: 25 });
    expect(prisma.paymentTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ user_id: 'v1', type: 'vendor_give_back' }) }));
    const args = prisma.booking.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ vendor_id: 'v1', deleted_at: null });
    expect(args.where.OR).toEqual([{ installments: { some: { refunded_amount: { gt: 0 } } } }, { id: { in: ['b9'] } }]);
  });

  it('Complaints: bookings with a dispute, open ones first', async () => {
    const { service, prisma } = setup();
    await service.getMyBookingsAsVendor('v1', { filter: 'complaints', page: 2, limit: 5 });
    const args = prisma.booking.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ vendor_id: 'v1', dispute_opened_at: { not: null } });
    expect(args.orderBy).toEqual([{ dispute_resolved_at: { sort: 'desc', nulls: 'first' } }, { dispute_opened_at: 'desc' }]);
    expect(args.skip).toBe(5);
  });

  it('the other tabs are unchanged', async () => {
    const { service, prisma } = setup();
    await service.getMyBookingsAsVendor('v1', { status: 'CONFIRMED' as any });
    const args = prisma.booking.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ vendor_id: 'v1', status: 'CONFIRMED', deleted_at: null });
    expect(args.orderBy).toEqual([{ created_at: 'desc' }]);
    expect(prisma.paymentTransaction.findMany).not.toHaveBeenCalled();
  });

  it('lists never include dispute photo keys; the booking gives the viewer signed links', async () => {
    const { service } = setup();
    const list = await service.getMyBookingsAsVendor('v1', {});
    expect(list.data[0].dispute_photos).toBeUndefined();
    expect(list.data[0].dispute_photo_count).toBe(2);

    const one = await service.getBooking('b1', 'v1');
    expect(one.data.dispute_photos).toBeUndefined();
    expect(one.data.dispute_photo_urls).toHaveLength(2);
    expect(SignedUrl.verify(one.data.dispute_photo_urls[0].split('/').pop())).toMatchObject({ key: 'disputes/b1/a.jpg', uid: 'v1', cid: 'b1' });
  });
});
