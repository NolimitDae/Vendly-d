import { BookingStatus, InstallmentStatus } from 'prisma/generated/enums';
import { PrivateStorage, SignedUrl } from 'src/modules/contracts/private-storage';
import { PaymentsService } from './payments.service';
import { checkDisputePhotos, describeDisputeAsk, resolveDisputeFile } from './dispute-files';

const store = new Map<string, Buffer>();
jest.mock('src/modules/contracts/private-storage', () => {
  const actual = jest.requireActual('src/modules/contracts/private-storage');
  return {
    ...actual,
    PrivateStorage: {
      newKey: (folder: string, ext: string) => `${folder}/${Math.random().toString(36).slice(2)}.${ext}`,
      put: jest.fn(async (key: string, data: Buffer) => void store.set(key, data)),
      get: jest.fn(async (key: string) => {
        const b = store.get(key);
        if (!b) throw new Error('missing');
        return b;
      }),
      remove: jest.fn(async (key: string) => void store.delete(key)),
    },
  };
});
jest.mock('src/config/app.config', () => ({ __esModule: true, default: () => ({ app: { url: 'https://api.test', client_app_url: 'https://app.test' } }) }));

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
const PDF = Buffer.from('%PDF-1.7 not a photo at all');
const photo = (buffer: Buffer) => ({ buffer, size: buffer.length });

function setup(booking: Record<string, unknown> = {}) {
  const prisma: any = {
    booking: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({
          customer_id: 'c1',
          status: BookingStatus.COMPLETED,
          released_at: null,
          dispute_opened_at: null,
          installments: [
            { kind: 'charge', status: InstallmentStatus.PAID, amount: 300, fee_amount: 15, refunded_amount: 0 },
            { kind: 'charge', status: InstallmentStatus.PAID, amount: 100, fee_amount: 5, refunded_amount: 40 },
            { kind: 'charge', status: InstallmentStatus.SCHEDULED, amount: 500, fee_amount: 25, refunded_amount: 0 },
          ],
          ...booking,
        })
        .mockResolvedValue({ vendor_id: 'v1', listing: { title: 'Wedding buffet' }, customer: { name: 'Amara' }, vendor: { email: 'v@x.com', name: 'Vee' } }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn(),
    },
    paymentTransaction: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'admin1' }]) },
  };
  const mail: any = { sendBookingNotification: jest.fn().mockResolvedValue(undefined) };
  const push: any = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  return { service: new PaymentsService(prisma, mail, push), prisma, mail, push };
}

describe('Disputes with details and photos', () => {
  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
  });

  it('stores the category, what is asked for and the photos as private storage keys', async () => {
    const { service, prisma, push, mail } = setup();
    await service.openDispute('b1', 'c1', { reason: '  The cake arrived smashed and late  ', category: 'damage', outcome: 'partial_refund', requested_amount: 120 }, [photo(JPEG), photo(PNG)]);

    const data = prisma.booking.updateMany.mock.calls[0][0].data;
    expect(data).toMatchObject({ dispute_reason: 'The cake arrived smashed and late', dispute_category: 'damage', dispute_outcome: 'partial_refund', dispute_requested_amount: 120 });
    expect(data.dispute_photos).toHaveLength(2);
    for (const key of data.dispute_photos) {
      expect(key).toMatch(/^disputes\/b1\/[a-z0-9]+\.(jpg|png)$/);
      expect(key).not.toMatch(/^https?:/);
      expect(store.has(key)).toBe(true);
    }
    // the vendor and Vendly hear what kind of problem it is and what the customer asks for
    expect(push.sendToUser).toHaveBeenCalledWith('v1', expect.objectContaining({ body: expect.stringContaining('Damage · asks for a partial refund of $120.00') }));
    expect(push.sendToUser).toHaveBeenCalledWith('v1', expect.objectContaining({ body: expect.stringContaining('2 photos') }));
    expect(mail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Damage') }));
    expect(push.sendToUser).toHaveBeenCalledWith('admin1', expect.objectContaining({ body: expect.stringContaining('asks for a partial refund') }));
  });

  it('still takes the reason alone (older apps)', async () => {
    const { service, prisma } = setup();
    await service.openDispute('b1', 'c1', 'The DJ never showed up at all');
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', dispute_opened_at: null },
      data: expect.objectContaining({ dispute_reason: 'The DJ never showed up at all', dispute_category: null, dispute_outcome: null, dispute_requested_amount: null, dispute_photos: [] }),
    });
    expect(PrivateStorage.put).not.toHaveBeenCalled();
  });

  it('keeps a partial refund under the vendor’s part of what was paid (what an admin can grant), and wants an amount only for one', async () => {
    // vendor's part paid: (300 − 15) + (100 − 5 − 40) = 340; the fee comes back only with a full refund
    await expect(setup().service.openDispute('b1', 'c1', { reason: 'Half the menu was missing', outcome: 'partial_refund', requested_amount: 340 })).rejects.toThrow(
      'A partial refund must be less than $340.00, the vendor’s part of what you’ve paid. To ask for everything back, choose a full refund.',
    );
    await expect(setup().service.openDispute('b1', 'c1', { reason: 'Half the menu was missing', outcome: 'partial_refund' })).rejects.toThrow('how much');
    await expect(setup().service.openDispute('b1', 'c1', { reason: 'Half the menu was missing', outcome: 'full_refund', requested_amount: 50 })).rejects.toThrow('only needed for a partial refund');
    const ok = setup();
    await ok.service.openDispute('b1', 'c1', { reason: 'Half the menu was missing', outcome: 'partial_refund', requested_amount: 339.99 });
    expect(ok.prisma.booking.updateMany.mock.calls[0][0].data.dispute_requested_amount).toBe(339.99);
  });

  it('refuses files that are not photos by their content, and more than 10, before storing any', async () => {
    const pdfNamedJpg = { ...photo(PDF), originalname: 'cake.jpg', mimetype: 'image/jpeg' };
    const { service, prisma } = setup();
    await expect(service.openDispute('b1', 'c1', { reason: 'See the photos of the damage' }, [photo(JPEG), pdfNamedJpg])).rejects.toThrow('JPEG, PNG, WebP or GIF');
    expect(PrivateStorage.put).not.toHaveBeenCalled();
    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
    expect(() => checkDisputePhotos(Array.from({ length: 11 }, () => photo(JPEG)))).toThrow('up to 10 photos');
    expect(() => checkDisputePhotos([{ buffer: JPEG, size: 11 * 1024 * 1024 }])).toThrow('under 10 MB');
  });

  it('removes stored photos when the booking can’t be updated', async () => {
    const { service, prisma } = setup();
    prisma.booking.updateMany.mockRejectedValueOnce(new Error('db down'));
    await expect(service.openDispute('b1', 'c1', { reason: 'Broken chairs everywhere' }, [photo(JPEG)])).rejects.toThrow('db down');
    expect(store.size).toBe(0);
  });

  it('lets only one of two simultaneous reports through, and drops the loser’s photos without telling anyone', async () => {
    const { service, prisma, push, mail } = setup();
    // another submission claimed the booking between our read and our write
    prisma.booking.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.openDispute('b1', 'c1', { reason: 'The cake arrived smashed and late' }, [photo(JPEG)])).rejects.toThrow('A problem was already reported on this booking.');
    expect(prisma.booking.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'b1', dispute_opened_at: null } }));
    expect(PrivateStorage.put).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(0);
    expect(push.sendToUser).not.toHaveBeenCalled();
    expect(mail.sendBookingNotification).not.toHaveBeenCalled();
  });

  it('caps a partial refund on a booking paid before installments at its vendor price, less refunds', async () => {
    const legacy = { installments: [], paid_at: new Date('2025-01-01'), amount: 400, service_fee: 20 };
    const a = setup(legacy);
    a.prisma.paymentTransaction.aggregate.mockResolvedValue({ _sum: { amount: 100 } });
    await expect(a.service.openDispute('b1', 'c1', { reason: 'Half the menu was missing', outcome: 'partial_refund', requested_amount: 300 })).rejects.toThrow('less than $300.00');
    expect(a.prisma.paymentTransaction.aggregate).toHaveBeenCalledWith({ where: { type: 'booking_refund', status: 'refunded', order_id: 'b1' }, _sum: { amount: true } });
    const b = setup(legacy);
    await b.service.openDispute('b1', 'c1', { reason: 'Half the menu was missing', outcome: 'partial_refund', requested_amount: 399 });
    expect(b.prisma.booking.updateMany.mock.calls[0][0].data.dispute_requested_amount).toBe(399);
  });

  it('keeps the old checks: only the customer, once, after the service started', async () => {
    await expect(setup().service.openDispute('b1', 'x', 'Not my booking but whatever')).rejects.toThrow('Access denied');
    await expect(setup({ dispute_opened_at: new Date() }).service.openDispute('b1', 'c1', 'Second report on this one')).rejects.toThrow('already open');
    await expect(setup({ status: BookingStatus.PENDING }).service.openDispute('b1', 'c1', 'Too early to report this')).rejects.toThrow('once the service has started');
  });

  it('takes a report on a confirmed booking once its start time has passed (the vendor may not have shown up)', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const future = new Date(Date.now() + 60 * 60 * 1000);
    await expect(setup({ status: BookingStatus.CONFIRMED, event_start_at: future }).service.openDispute('b1', 'c1', 'The DJ is not here yet')).rejects.toThrow('once the booking’s start time has passed');
    await expect(setup({ status: BookingStatus.CONFIRMED }).service.openDispute('b1', 'c1', 'No date on this booking')).rejects.toThrow('once the booking’s start time has passed');
    const ok = setup({ status: BookingStatus.CONFIRMED, event_start_at: null, scheduled_at: past });
    await ok.service.openDispute('b1', 'c1', { reason: 'The DJ never showed up at all', category: 'no_show', outcome: 'full_refund' });
    expect(ok.prisma.booking.updateMany.mock.calls[0][0].data).toMatchObject({ dispute_category: 'no_show', dispute_outcome: 'full_refund' });
    expect(ok.push.sendToUser).toHaveBeenCalledWith('admin1', expect.objectContaining({ title: 'New dispute' }));
  });

  it('shows Vendly the category, the ask and signed photo links, never the storage keys', async () => {
    const { service, prisma } = setup();
    prisma.booking.findMany.mockResolvedValue([
      {
        id: 'b1', status: 'COMPLETED', dispute_category: 'late', dispute_outcome: 'partial_refund', dispute_requested_amount: '50.00', dispute_photos: ['disputes/b1/a.jpg'],
        installments: [{ status: InstallmentStatus.PAID, amount: 200, fee_amount: 10, refunded_amount: 0 }], proofs: [],
      },
    ]);
    const res = await service.listDisputes('open', 'admin1');
    const row: any = res.data[0];
    expect(row.dispute_photos).toBeUndefined();
    expect(row.dispute_requested_amount).toBe(50);
    expect(row.dispute_ask).toBe('Vendor was late · asks for a partial refund of $50.00');
    expect(row.dispute_photo_urls).toHaveLength(1);
    expect(row.dispute_photo_urls[0]).toMatch(/^https:\/\/api\.test\/api\/dispute-files\/[\w-]+\.[\w-]+$/);
    const claims = SignedUrl.verify(row.dispute_photo_urls[0].split('/').pop());
    expect(claims).toMatchObject({ key: 'disputes/b1/a.jpg', uid: 'admin1', cid: 'b1' });
  });

  it('serves a photo from a signed link, and only dispute photos', async () => {
    store.set('disputes/b1/a.png', PNG);
    const ok = await resolveDisputeFile(SignedUrl.sign({ key: 'disputes/b1/a.png', uid: 'c1', cid: 'b1', name: 'dispute-photo' }));
    expect(ok.type).toBe('image/png');
    await expect(resolveDisputeFile(SignedUrl.sign({ key: 'identity/u1/front.jpg', uid: 'c1', cid: 'b1', name: 'x' }))).rejects.toThrow('expired');
    await expect(resolveDisputeFile('forged.token')).rejects.toThrow('expired');
  });

  it('describes the ask in words', () => {
    expect(describeDisputeAsk({ category: 'no_show', outcome: 'full_refund' })).toBe('Vendor didn’t show up · asks for a full refund');
    expect(describeDisputeAsk({})).toBe('');
  });
});
