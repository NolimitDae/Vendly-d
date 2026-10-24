import { ACTIVE_VENDOR_WHERE } from 'src/common/helper/active-vendor';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { BookingStatus, RentalItemStatus } from 'prisma/generated/enums';
import { __setFeeCache } from 'src/modules/platform/platform-settings.service';
import { RentalsService } from './rentals.service';

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({ TanvirStorage: { put: jest.fn(), delete: jest.fn(), url: (p: string) => `https://cdn.test/${p}` } }));
jest.mock('src/config/app.config', () => ({ __esModule: true, default: () => ({ app: { client_app_url: 'https://app.test' }, storageUrl: { avatar: 'avatar' } }) }));

const day = (n: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() + n * 24 * 3600 * 1000);
};
const iso = (d: Date) => d.toISOString().slice(0, 10);

const chairs = { id: 'chairs', vendor_id: 'v1', title: 'Chiavari chair', quantity: 10, turnaround_hours: 0, daily_rate: 5, deposit_amount: 2, category_id: null, status: RentalItemStatus.ACTIVE, deleted_at: null, vendor: { status: 1, deleted_at: null } };
const arch = { id: 'arch', vendor_id: 'v1', title: 'Flower arch', quantity: 1, turnaround_hours: 24, daily_rate: 120, deposit_amount: 50, category_id: null, status: RentalItemStatus.ACTIVE, deleted_at: null, vendor: { status: 1, deleted_at: null } };

const prisma: any = {
  rentalItem: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
  rentalReservation: { findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
  rentalReturn: { create: jest.fn() },
  booking: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};
const payments = { assertOwnsCard: jest.fn().mockResolvedValue('cus_1'), settleSecurityDeposit: jest.fn() };
const mail = { sendBookingNotification: jest.fn().mockResolvedValue(undefined) };
const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };

describe('RentalsService', () => {
  let service: RentalsService;

  beforeEach(() => {
    jest.clearAllMocks();
    __setFeeCache({ percent: 5, minimum: 0, commission: 0, categories: new Map() });
    prisma.$transaction.mockImplementation((fn: any) => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn)));
    prisma.rentalItem.findMany.mockResolvedValue([chairs, arch]);
    prisma.rentalReservation.findMany.mockResolvedValue([]);
    prisma.booking.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'b1', status: BookingStatus.PENDING, vendor_id: data.vendor_id, amount: data.amount, rental_reservations: [{ item: { title: 'Chiavari chair' } }, { item: { title: 'Flower arch' } }], vendor: { email: 'v@x.com', name: 'Nia' }, customer: { name: 'Amara' } }),
    );
    service = new RentalsService(prisma, payments as any, mail as any, push as any);
  });
  afterAll(() => __setFeeCache(null));

  const order = (over: Record<string, unknown> = {}) => ({
    lines: [{ item_id: 'chairs', quantity: 8 }, { item_id: 'arch', quantity: 1 }],
    start_date: iso(day(10)),
    end_date: iso(day(12)),
    payment_method_id: 'pm_1',
    ...over,
  });

  it('quotes rate × days × quantity, the fee and the deposit', async () => {
    const { data } = await service.quote(order());
    // 3 days: chairs 8 × 5 × 3 = 120, arch 120 × 3 = 360
    expect(data).toMatchObject({ days: 3, subtotal: 480, service_fee: 24, security_deposit: 66, due_on_accept: 504, available: true });
  });

  it('books, locking the items and storing reservations and the deposit', async () => {
    const res = await service.book('c1', order());
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(payments.assertOwnsCard).toHaveBeenCalledWith('c1', 'pm_1');
    const data = prisma.booking.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ customer_id: 'c1', vendor_id: 'v1', amount: 480, service_fee: 24, security_deposit: 66, payment_method_id: 'pm_1', payment_plan: 'FULL_ON_ACCEPT' });
    expect(data.rental_reservations.create).toHaveLength(2);
    expect(res.data.title).toBe('Chiavari chair + 1 more');
    expect(mail.sendBookingNotification).toHaveBeenCalled();
  });

  it('refuses when another booking holds the stock', async () => {
    prisma.rentalReservation.findMany.mockResolvedValue([{ item_id: 'chairs', start_date: day(11), end_date: day(11), quantity: 5 }]);
    await expect(service.book('c1', order())).rejects.toThrow(new ConflictException('Only 5 × Chiavari chair left for those dates.'));
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('counts the turnaround: the arch returned the day before is still being cleaned', async () => {
    prisma.rentalReservation.findMany.mockResolvedValue([{ item_id: 'arch', start_date: day(7), end_date: day(9), quantity: 1 }]);
    await expect(service.book('c1', order())).rejects.toThrow(/Flower arch is booked/);
  });

  it('only rents from one vendor per booking', async () => {
    prisma.rentalItem.findMany.mockResolvedValue([chairs, { ...arch, vendor_id: 'v2' }]);
    await expect(service.quote(order())).rejects.toThrow(BadRequestException);
  });

  it('stops vendors renting their own items', async () => {
    await expect(service.book('v1', order())).rejects.toThrow(/your own items/);
  });

  it('hides and refuses suspended or deleted vendors', async () => {
    prisma.rentalItem.findMany.mockResolvedValue([{ ...chairs, vendor: { status: 0, deleted_at: null } }, { ...arch, vendor: { status: 0, deleted_at: null } }]);
    await expect(service.quote(order())).rejects.toThrow('This vendor isn’t taking bookings right now. Try another vendor.');
    await expect(service.book('c1', order())).rejects.toThrow(/isn’t taking bookings/);
    expect(prisma.booking.create).not.toHaveBeenCalled();
    prisma.rentalItem.findMany.mockResolvedValue([{ ...chairs, vendor: { status: 1, deleted_at: new Date() } }]);
    await expect(service.quote(order({ lines: [{ item_id: 'chairs', quantity: 1 }] }))).rejects.toThrow(/isn’t taking bookings/);

    prisma.rentalItem.findMany.mockResolvedValue([]);
    prisma.rentalItem.count.mockResolvedValue(0);
    await service.browse({});
    expect(prisma.rentalItem.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ vendor: ACTIVE_VENDOR_WHERE }) }));
    prisma.rentalItem.findFirst.mockResolvedValue(null);
    await expect(service.getItem('chairs')).rejects.toThrow(/not found/);
    expect(prisma.rentalItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ vendor: ACTIVE_VENDOR_WHERE }) }));
  });

  it('rejects paused items and past dates', async () => {
    prisma.rentalItem.findMany.mockResolvedValue([{ ...chairs, status: RentalItemStatus.PAUSED }, arch]);
    await expect(service.quote(order())).rejects.toThrow(/no longer available/);
    await expect(service.quote(order({ start_date: iso(day(-2)) }))).rejects.toThrow(/already passed/);
  });

  describe('returns', () => {
    const rental = (over: Record<string, unknown> = {}) => ({
      id: 'b1', vendor_id: 'v1', customer_id: 'c1', status: BookingStatus.COMPLETED, released_at: null, release_at: day(3), rental_return: null,
      rental_reservations: [{ id: 'r1', item: { title: 'Flower arch' } }], customer: { email: 'a@x.com', name: 'Amara' }, ...over,
    });

    it('releases the deposit when nothing is wrong', async () => {
      prisma.booking.findUnique.mockResolvedValue(rental());
      payments.settleSecurityDeposit.mockResolvedValue({ captured_from_deposit: 0, charged_extra: 0, deposit_released: true });
      const res = await service.recordReturn('b1', 'v1', {});
      expect(prisma.rentalReservation.updateMany).toHaveBeenCalledWith({ where: { booking_id: 'b1', status: 'ACTIVE' }, data: { status: 'RETURNED' } });
      expect(payments.settleSecurityDeposit).toHaveBeenCalledWith('b1', 0);
      expect(res.data.fees).toBe(0);
      expect(mail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/deposit hold has been released/) }));
    });

    it('takes damage and late fees and gives the customer 48h to dispute', async () => {
      prisma.booking.findUnique.mockResolvedValue(rental({ release_at: new Date() }));
      payments.settleSecurityDeposit.mockResolvedValue({ captured_from_deposit: 50, charged_extra: 10 });
      await service.recordReturn('b1', 'v1', { damage_fee: 45, late_fee: 15, notes: 'Arch frame bent' });
      expect(payments.settleSecurityDeposit).toHaveBeenCalledWith('b1', 60);
      expect(prisma.rentalReturn.create).toHaveBeenCalledWith({ data: expect.objectContaining({ damage_reported: true, damage_fee: 45, late_fee: 15 }) });
      const releaseAt: Date = prisma.booking.update.mock.calls[0][0].data.release_at;
      expect(releaseAt.getTime()).toBeGreaterThan(Date.now() + 47 * 3600 * 1000);
    });

    it('needs evidence for fees, only lets the vendor record it, and only once', async () => {
      prisma.booking.findUnique.mockResolvedValue(rental());
      await expect(service.recordReturn('b1', 'v1', { damage_fee: 20 })).rejects.toThrow(/photos or a note/);
      await expect(service.recordReturn('b1', 'c1', {})).rejects.toThrow(ForbiddenException);
      prisma.booking.findUnique.mockResolvedValue(rental({ rental_return: { id: 'x' } }));
      await expect(service.recordReturn('b1', 'v1', {})).rejects.toThrow(/already been recorded/);
    });

    it('keeps return photos under random names and refuses files that are not photos', async () => {
      const { TanvirStorage } = jest.requireMock('src/common/lib/Disk/TanvirStorage');
      const jpg = { originalname: 'arch.jpg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]) } as Express.Multer.File;
      const pdf = { originalname: 'arch.jpg', buffer: Buffer.from('%PDF-1.4') } as Express.Multer.File;
      prisma.booking.findUnique.mockResolvedValue(rental());
      await expect(service.recordReturn('b1', 'v1', { notes: 'bent' }, [jpg, pdf])).rejects.toThrow(BadRequestException);
      expect(TanvirStorage.put).not.toHaveBeenCalled();
      expect(prisma.rentalReturn.create).not.toHaveBeenCalled();

      payments.settleSecurityDeposit.mockResolvedValue({ captured_from_deposit: 0, charged_extra: 0, deposit_released: true });
      await service.recordReturn('b1', 'v1', {}, [jpg]);
      const photos = prisma.rentalReturn.create.mock.calls[0][0].data.photos;
      expect(photos).toEqual([expect.stringMatching(/^[0-9a-f]{24}\.jpg$/)]);
      expect(TanvirStorage.put).toHaveBeenCalledWith(`proofs/${photos[0]}`, jpg.buffer);
    });
  });

  describe('item photos', () => {
    const jpg = { originalname: 'chair.png.html', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]) } as Express.Multer.File;
    const html = { originalname: 'chair.jpg', buffer: Buffer.from('<html></html>') } as Express.Multer.File;

    it('stores item photos under random names with their real extension', async () => {
      prisma.rentalItem.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'i1', ...data }));
      await service.createItem('v1', { title: 'Chair', daily_rate: 5 } as any, [jpg]);
      expect(prisma.rentalItem.create.mock.calls[0][0].data.images).toEqual([expect.stringMatching(/^[0-9a-f]{24}\.jpg$/)]);
    });

    it('refuses a non-photo before removing any current photo', async () => {
      const { TanvirStorage } = jest.requireMock('src/common/lib/Disk/TanvirStorage');
      prisma.rentalItem.findFirst.mockResolvedValue({ ...chairs, images: ['a.jpg', 'b.jpg'] });
      await expect(service.updateItem('chairs', 'v1', { keep_images: ['a.jpg'] } as any, [html])).rejects.toThrow(BadRequestException);
      expect(TanvirStorage.delete).not.toHaveBeenCalled();
      expect(prisma.rentalItem.update).not.toHaveBeenCalled();
    });
  });
});
