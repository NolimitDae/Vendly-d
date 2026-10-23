import { BookingExtrasService } from './booking-extras.service';
import { __setFeeCache } from 'src/modules/platform/platform-settings.service';

jest.mock('src/config/app.config', () => ({ __esModule: true, default: () => ({ app: { client_app_url: 'https://app.test' } }) }));

const HOUR = 3600 * 1000;

const booking = (over: Record<string, unknown> = {}) => ({
  id: 'b1', status: 'IN_PROGRESS', vendor_id: 'v1', customer_id: 'c1', completed_at: null, guest_count: 80, currency: 'usd', payment_method_id: 'pm_1',
  dispute_opened_at: null, dispute_resolved_at: null,
  listing: { title: 'Wedding catering', category_id: null },
  customer: { id: 'c1', name: 'Amara', email: 'a@x.com' },
  vendor: { id: 'v1', name: 'Vee', email: 'v@x.com', vendorProfile: { business_name: 'Vee Catering' } },
  ...over,
});

const extra = (over: Record<string, unknown> = {}) => ({
  id: 'e1', booking_id: 'b1', add_on_id: null, kind: 'FEE', name: 'Late return', description: null, unit_price: 50, price_unit: 'PER_HOUR', quantity: 3, amount: 150, fee_amount: 0,
  note: 'Returned 3 hours late', status: 'PENDING', created_at: new Date(), responded_at: null, decline_reason: null, reminded_at: null, review_requested_at: null, review_note: null, reviewed_at: null, reviewed_by: null, installment_id: null, installment: null,
  ...over,
});

function setup() {
  const prisma: any = {
    booking: { findUnique: jest.fn().mockResolvedValue(booking()) },
    bookingExtra: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(({ data }: any) => Promise.resolve(extra({ ...data, id: 'new' }))),
      findUnique: jest.fn().mockResolvedValue(extra()),
      findUniqueOrThrow: jest.fn().mockResolvedValue(extra()),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
    bookingInstallment: { findFirst: jest.fn().mockResolvedValue({ sequence: 2, currency: 'usd' }), create: jest.fn(({ data }: any) => Promise.resolve({ id: 'inst', ...data })) },
    vendorAddOn: { findFirst: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(prisma)),
  };
  const payments: any = { chargeInstallment: jest.fn().mockResolvedValue({ status: 'PAID' }), payOutLateFor: jest.fn().mockResolvedValue(null), assertOwnsCard: jest.fn() };
  const mail: any = { sendBookingNotification: jest.fn().mockResolvedValue(undefined) };
  const push: any = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  return { service: new BookingExtrasService(prisma, payments, mail, push), prisma, payments, push };
}

describe('BookingExtrasService', () => {
  beforeEach(() => __setFeeCache({ percent: 5, minimum: 3, commission: 0, categories: new Map() }));
  afterEach(() => __setFeeCache(null));

  describe('vendor requests', () => {
    it('sends a fee to the customer without a Vendly fee on top', async () => {
      const { service, prisma, push } = setup();
      const res = await service.request('b1', 'v1', { kind: 'FEE', name: 'Late return', unit_price: 50, price_unit: 'PER_HOUR', quantity: 3, note: 'Returned 3 hours late' } as any);
      expect(prisma.bookingExtra.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 150, fee_amount: 0, status: 'PENDING', quantity: 3 }) });
      expect(res.data.total).toBe(150);
      expect(push.sendToUser).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'A fee needs your approval' }));
    });

    it('adds the Vendly Protection percentage to add-ons and counts per person add-ons by the booking guests', async () => {
      const { service, prisma } = setup();
      await service.request('b1', 'v1', { kind: 'ADD_ON', name: 'Dessert table', unit_price: 6, price_unit: 'PER_PERSON' } as any);
      expect(prisma.bookingExtra.create).toHaveBeenCalledWith({ data: expect.objectContaining({ quantity: 80, amount: 480, fee_amount: 24 }) });
    });

    it('fills name and price from the library', async () => {
      const { service, prisma } = setup();
      prisma.vendorAddOn.findFirst.mockResolvedValue({ id: 'lib', kind: 'FEE', name: 'Cleaning', description: 'Extra cleaning', price: 120, price_unit: 'FIXED', max_quantity: null });
      await service.request('b1', 'v1', { kind: 'FEE', add_on_id: 'lib' } as any);
      expect(prisma.bookingExtra.create).toHaveBeenCalledWith({ data: expect.objectContaining({ add_on_id: 'lib', name: 'Cleaning', amount: 120 }) });
    });

    it('only allows fees once the job has started, and add-ons once confirmed', async () => {
      const { service, prisma } = setup();
      prisma.booking.findUnique.mockResolvedValue(booking({ status: 'CONFIRMED' }));
      await expect(service.request('b1', 'v1', { kind: 'FEE', name: 'Cleaning', unit_price: 50 } as any)).rejects.toThrow('once the job has started');
      await expect(service.request('b1', 'v1', { kind: 'ADD_ON', name: 'Extra hour', unit_price: 50 } as any)).resolves.toBeTruthy();
      prisma.booking.findUnique.mockResolvedValue(booking({ status: 'PENDING' }));
      await expect(service.request('b1', 'v1', { kind: 'ADD_ON', name: 'Extra hour', unit_price: 50 } as any)).rejects.toThrow('confirmed');
    });

    it('allows requests for 14 days after completion, then stops', async () => {
      const { service, prisma } = setup();
      prisma.booking.findUnique.mockResolvedValue(booking({ status: 'COMPLETED', completed_at: new Date(Date.now() - 13 * 24 * HOUR) }));
      await expect(service.request('b1', 'v1', { kind: 'FEE', name: 'Cleaning', unit_price: 50 } as any)).resolves.toBeTruthy();
      prisma.booking.findUnique.mockResolvedValue(booking({ status: 'COMPLETED', completed_at: new Date(Date.now() - 15 * 24 * HOUR) }));
      await expect(service.request('b1', 'v1', { kind: 'FEE', name: 'Cleaning', unit_price: 50 } as any)).rejects.toThrow('14 days');
    });

    it('refuses strangers, open disputes, fractional items and absurd amounts', async () => {
      const { service, prisma } = setup();
      await expect(service.request('b1', 'other', { kind: 'FEE', name: 'Cleaning', unit_price: 50 } as any)).rejects.toThrow('Access denied');
      await expect(service.request('b1', 'v1', { kind: 'FEE', name: 'Damaged plates', unit_price: 5, price_unit: 'PER_ITEM', quantity: 2.5 } as any)).rejects.toThrow('Only hours');
      await expect(service.request('b1', 'v1', { kind: 'FEE', name: 'Damage', unit_price: 30000 } as any)).rejects.toThrow('up to $25,000');
      prisma.booking.findUnique.mockResolvedValue(booking({ dispute_opened_at: new Date() }));
      await expect(service.request('b1', 'v1', { kind: 'FEE', name: 'Cleaning', unit_price: 50 } as any)).rejects.toThrow('open dispute');
    });
  });

  describe('customer answers', () => {
    it('approving adds it as an installment and charges the booking card', async () => {
      const { service, prisma, payments } = setup();
      const res = await service.approve('e1', 'c1');
      expect(prisma.bookingExtra.updateMany).toHaveBeenCalledWith({ where: { id: 'e1', status: 'PENDING' }, data: expect.objectContaining({ status: 'APPROVED' }) });
      expect(prisma.bookingInstallment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ sequence: 3, amount: 150, fee_amount: 0, kind: 'extra', label: 'Fee: Late return' }) });
      expect(payments.chargeInstallment).toHaveBeenCalledWith('inst', 'pm_1');
      expect(payments.payOutLateFor).toHaveBeenCalledWith('b1');
      expect(res.data.paid).toBe(true);
    });

    it('can pay with another of the customer’s cards', async () => {
      const { service, payments } = setup();
      await service.approve('e1', 'c1', 'pm_2');
      expect(payments.assertOwnsCard).toHaveBeenCalledWith('c1', 'pm_2');
      expect(payments.chargeInstallment).toHaveBeenCalledWith('inst', 'pm_2');
    });

    it('cannot be answered twice', async () => {
      const { service, prisma } = setup();
      prisma.bookingExtra.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.approve('e1', 'c1')).rejects.toThrow('already been answered');
      await expect(service.decline('e1', 'c1')).rejects.toThrow('already been answered');
    });

    it('only the customer can answer', async () => {
      const { service } = setup();
      await expect(service.approve('e1', 'v1')).rejects.toThrow('Access denied');
      await expect(service.decline('e1', 'v1')).rejects.toThrow('Access denied');
    });

    it('declining tells the vendor they can ask Vendly to review a fee', async () => {
      const { service, push } = setup();
      await service.decline('e1', 'c1', 'They were on time');
      expect(push.sendToUser).toHaveBeenCalledWith('v1', expect.objectContaining({ body: expect.stringContaining('ask Vendly to review') }));
    });
  });

  describe('Vendly review', () => {
    it('lets the vendor escalate a declined fee', async () => {
      const { service, prisma } = setup();
      prisma.bookingExtra.findUnique.mockResolvedValue(extra({ status: 'DECLINED' }));
      await service.escalate('e1', 'v1', 'Contract says $50 per late hour; photos uploaded.');
      expect(prisma.bookingExtra.updateMany).toHaveBeenCalledWith({ where: { id: 'e1', status: 'DECLINED' }, data: expect.objectContaining({ status: 'IN_REVIEW' }) });
    });

    it('lets an unanswered fee be escalated only after 72 hours', async () => {
      const { service, prisma } = setup();
      prisma.bookingExtra.findUnique.mockResolvedValue(extra({ created_at: new Date(Date.now() - 10 * HOUR) }));
      await expect(service.escalate('e1', 'v1', 'No answer from the customer')).rejects.toThrow('72 hours');
      prisma.bookingExtra.findUnique.mockResolvedValue(extra({ created_at: new Date(Date.now() - 73 * HOUR) }));
      await expect(service.escalate('e1', 'v1', 'No answer from the customer')).resolves.toEqual({ success: true });
    });

    it('never escalates add-ons', async () => {
      const { service, prisma } = setup();
      prisma.bookingExtra.findUnique.mockResolvedValue(extra({ kind: 'ADD_ON', status: 'DECLINED' }));
      await expect(service.escalate('e1', 'v1', 'They asked for it')).rejects.toThrow('Only fees');
    });

    it('admin charges an owed fee or waives it', async () => {
      const { service, prisma, payments } = setup();
      prisma.bookingExtra.findUnique.mockResolvedValue(extra({ status: 'IN_REVIEW' }));
      await service.adminReview('e1', 'admin', { action: 'charge', note: 'Late return is in the signed contract' });
      expect(prisma.bookingExtra.updateMany).toHaveBeenCalledWith({ where: { id: 'e1', status: 'IN_REVIEW' }, data: expect.objectContaining({ status: 'APPROVED', reviewed_by: 'admin' }) });
      expect(payments.chargeInstallment).toHaveBeenCalled();

      payments.chargeInstallment.mockClear();
      await service.adminReview('e1', 'admin', { action: 'waive', note: 'Not in the contract' });
      expect(prisma.bookingExtra.updateMany).toHaveBeenLastCalledWith({ where: { id: 'e1', status: 'IN_REVIEW' }, data: expect.objectContaining({ status: 'WAIVED' }) });
      expect(payments.chargeInstallment).not.toHaveBeenCalled();
    });
  });

  it('reminds the customer once after a day', async () => {
    const { service, prisma, push } = setup();
    prisma.bookingExtra.findMany.mockResolvedValue([{ id: 'e1', booking_id: 'b1', name: 'Late return', kind: 'FEE', amount: 150, fee_amount: 0 }]);
    expect(await service.remind()).toBe(1);
    expect(prisma.bookingExtra.updateMany).toHaveBeenCalledWith({ where: { id: 'e1', reminded_at: null }, data: { reminded_at: expect.any(Date) } });
    expect(push.sendToUser).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'Still waiting for your answer' }));
  });
});
