import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BookingService } from './booking.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { PushService } from 'src/modules/push/push.service';
import { BookingContractsService } from 'src/modules/contracts/booking-contracts.service';
import { PaymentsService } from 'src/modules/payments/payments.service';
import { ChatExtrasService } from 'src/modules/chat/extras/chat-extras.service';
import { EventToolsService } from 'src/modules/events/tools/event-tools.service';
import { BookingStatus, ListingStatus } from 'prisma/generated/client';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';

jest.mock('src/common/lib/Payment/stripe/StripePayment', () => ({
  StripePayment: {
    createCheckoutSessionForBooking: jest.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout.test/cs_1' }),
    retrieveCheckoutSession: jest.fn(),
    refundPaymentIntent: jest.fn().mockResolvedValue({ id: 're_1' }),
  },
}));

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({
  TanvirStorage: {
    put: jest.fn().mockResolvedValue(undefined),
    url: jest.fn((p: string) => `https://cdn.test/${p}`),
  },
}));

const mockPrisma = {
  eventBooking: { findMany: jest.fn().mockResolvedValue([]) },
  vendorListing: {
    findFirst: jest.fn(),
  },
  booking: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  paymentTransaction: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
  bookingContract: { findFirst: jest.fn() },
  bookingInstallment: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  bookingExtra: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), findMany: jest.fn().mockResolvedValue([]) },
  $transaction: jest.fn((fn: any) => fn(mockPrisma)),
  bookingProof: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  bookingDeliverable: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockPush = { sendToUser: jest.fn().mockResolvedValue(undefined) };

const mockPayments = {
  scheduleForBooking: jest.fn().mockResolvedValue([]),
  onBookingCompleted: jest.fn().mockResolvedValue(undefined),
  onProofUploaded: jest.fn().mockResolvedValue(undefined),
  refundBooking: jest.fn().mockResolvedValue(0),
  voidOpenCharges: jest.fn().mockResolvedValue(undefined),
  cardLabel: jest.fn().mockResolvedValue(null),
  sendFinalInvoice: jest.fn().mockResolvedValue(true),
};

const mockContracts = {
  createSignedBooking: jest.fn(),
  countersignForBooking: jest.fn(),
  voidPendingForBooking: jest.fn().mockResolvedValue(0),
};

const mockMail = {
  sendOtpCodeToEmail: jest.fn().mockResolvedValue(undefined),
  sendBookingNotification: jest.fn().mockResolvedValue(undefined),
};

const mockListing = {
  id: 'listing-1',
  vendor_id: 'vendor-1',
  status: ListingStatus.ACTIVE,
  deleted_at: null,
  price: 100,
  title: 'Test Service',
  vendor: { id: 'vendor-1', name: 'Vendor', email: 'vendor@test.com' },
};

const mockBooking = {
  id: 'booking-1',
  customer_id: 'customer-1',
  vendor_id: 'vendor-1',
  listing_id: 'listing-1',
  status: BookingStatus.PENDING,
  deleted_at: null,
  amount: 100,
  customer: { id: 'customer-1', name: 'Customer', email: 'customer@test.com', avatar: null },
  vendor: { id: 'vendor-1', name: 'Vendor', email: 'vendor@test.com', avatar: null },
  listing: { id: 'listing-1', title: 'Test Service', price: 100, images: [] },
  review: null,
};

describe('BookingService', () => {
  let service: BookingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMail },
        { provide: PushService, useValue: mockPush },
        { provide: BookingContractsService, useValue: mockContracts },
        { provide: PaymentsService, useValue: mockPayments },
        { provide: ChatExtrasService, useValue: { syncEventChat: jest.fn().mockResolvedValue(null) } },
        { provide: EventToolsService, useValue: { syncBookingBudget: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<BookingService>(BookingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const signedRequest = {
      listing_id: 'listing-1',
      vendor_id: 'vendor-1',
      preview_token: 'token',
      signature: { legal_name: 'Customer', consent: true, content_sha256: 'a'.repeat(64) },
    } as any;

    it('creates the booking through the signed-contract flow and notifies the vendor', async () => {
      mockContracts.createSignedBooking.mockResolvedValue({ id: 'booking-1' });
      mockPrisma.booking.findUniqueOrThrow.mockResolvedValue(mockBooking);

      const result = await service.create('customer-1', signedRequest, { ip: '1.2.3.4' });

      expect(result.success).toBe(true);
      expect(mockContracts.createSignedBooking).toHaveBeenCalledWith('customer-1', signedRequest, { ip: '1.2.3.4' }, []);
      expect(mockPush.sendToUser).toHaveBeenCalledWith('vendor-1', expect.objectContaining({ data: { type: 'booking', bookingId: 'booking-1' } }), 'booking_updates');
    });

    it('propagates contract validation errors (e.g. missing listing)', async () => {
      mockContracts.createSignedBooking.mockRejectedValue(new NotFoundException('Listing not found or not active'));
      await expect(service.create('customer-1', signedRequest)).rejects.toThrow(NotFoundException);
    });
  });

  describe('reject', () => {
    it('declines an open request and voids its contract', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });
      await service.reject('booking-1', 'vendor-1', { reason: 'Fully booked' });
      expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: 'booking-1', status: BookingStatus.PENDING }, data: { status: BookingStatus.REJECTED, reject_reason: 'Fully booked' } });
      expect(mockContracts.voidPendingForBooking).toHaveBeenCalledWith('booking-1', 'Vendor declined the booking', 'vendor-1');
    });

    it('does nothing if the request closed in the meantime', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.reject('booking-1', 'vendor-1', { reason: 'x' })).rejects.toThrow('no longer open');
      expect(mockContracts.voidPendingForBooking).not.toHaveBeenCalled();
      expect(mockPush.sendToUser).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('should confirm a pending booking', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPrisma.booking.update.mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
      });

      mockContracts.countersignForBooking.mockResolvedValue(null);
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.confirm('booking-1', 'vendor-1');
      expect(result.success).toBe(true);
      expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: 'booking-1', status: BookingStatus.PENDING }, data: { status: BookingStatus.CONFIRMED } });
    });

    it("won't confirm a request that expired after it was loaded", async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      const tx = { booking: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
      mockContracts.countersignForBooking.mockImplementation(async (_b, _v, _s, _m, onExecuted) => {
        await onExecuted(tx);
        return { id: 'contract-1' };
      });
      await expect(service.confirm('booking-1', 'vendor-1')).rejects.toThrow('wasn’t answered in time');
      expect(mockPayments.scheduleForBooking).not.toHaveBeenCalled();
    });

    it('refuses a request that is past its time even before the hourly job closes it', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, created_at: new Date(Date.now() - 80 * 3_600_000), event_start_at: null });
      await expect(service.confirm('booking-1', 'vendor-1')).rejects.toThrow('wasn’t answered in time');
      expect(mockContracts.countersignForBooking).not.toHaveBeenCalled();
    });

    it('explains why an expired request can no longer be accepted', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.REJECTED, expired_at: new Date() });
      await expect(service.confirm('booking-1', 'vendor-1')).rejects.toThrow('wasn’t answered in time');
    });

    it('countersigns the contract and confirms inside the same transaction (Accept & Sign)', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      const signature = { legal_name: 'Vendor', consent: true, content_sha256: 'a'.repeat(64) } as any;
      const tx = { booking: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
      mockContracts.countersignForBooking.mockImplementation(async (_b, _v, _s, _m, onExecuted) => {
        await onExecuted(tx);
        return { id: 'contract-1' };
      });

      await service.confirm('booking-1', 'vendor-1', { signature });

      expect(mockContracts.countersignForBooking).toHaveBeenCalledWith('booking-1', 'vendor-1', signature, {}, expect.any(Function));
      expect(tx.booking.updateMany).toHaveBeenCalledWith({ where: { id: 'booking-1', status: BookingStatus.PENDING }, data: { status: BookingStatus.CONFIRMED } });
      expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when wrong vendor tries to confirm', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);

      await expect(service.confirm('booking-1', 'wrong-vendor')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when booking is not PENDING', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
      });

      await expect(service.confirm('booking-1', 'vendor-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    const DAY = 24 * 3600 * 1000;
    const paidBooking = (overrides: Record<string, unknown> = {}) => ({
      ...mockBooking,
      status: BookingStatus.CONFIRMED,
      amount: 450,
      service_fee: 22.5,
      currency: 'usd',
      paid_at: new Date(),
      payment_transaction_id: 'cs_paid',
      event_start_at: new Date(Date.now() + 3 * DAY),
      ...overrides,
    });

    beforeEach(() => {
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });
      (StripePayment.retrieveCheckoutSession as jest.Mock).mockResolvedValue({ payment_intent: 'pi_paid' });
      (StripePayment.refundPaymentIntent as jest.Mock).mockResolvedValue({ id: 're_1' });
      mockPrisma.bookingContract.findFirst.mockResolvedValue({ merge_data: { cancellation_policy: 'flexible' } });
    });

    it('lets the customer cancel an unpaid booking without touching Stripe', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);

      const result = await service.cancel('booking-1', 'customer-1', { reason: 'Changed mind' });

      expect(result.success).toBe(true);
      expect(result.data.refund).toBeNull();
      expect(mockContracts.voidPendingForBooking).toHaveBeenCalledWith('booking-1', 'Booking cancelled', 'customer-1');
      expect(StripePayment.refundPaymentIntent).not.toHaveBeenCalled();
    });

    it('lets the vendor cancel', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      const result = await service.cancel('booking-1', 'vendor-1', {});
      expect(result.success).toBe(true);
    });

    it('vendor cancels a paid booking: refunds everything, including the Vendly Protection fee', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(paidBooking());

      const result = await service.cancel('booking-1', 'vendor-1', {});

      expect(StripePayment.refundPaymentIntent).toHaveBeenCalledWith('pi_paid', 'cancel-booking-1', 472.5);
      expect(result.data.refund).toMatchObject({ refundTotal: 472.5, vendorKeeps: 0 });
      expect(mockPrisma.paymentTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'booking_refund', status: 'refunded', amount: 472.5 }) }),
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('customer cancels inside the 50% window: half the price back, fee kept, vendor credited the rest', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(paidBooking());

      const result = await service.cancel('booking-1', 'customer-1', {});

      expect(StripePayment.refundPaymentIntent).toHaveBeenCalledWith('pi_paid', 'cancel-booking-1', 225);
      expect(result.data.refund).toMatchObject({ refundTotal: 225, refundFee: 0, vendorKeeps: 225, percent: 50 });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'vendor-1' }, data: { balance: { increment: 225 } } });
    });

    it('uses the policy from the signed contract', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(paidBooking());
      mockPrisma.bookingContract.findFirst.mockResolvedValue({ merge_data: { cancellation_policy: 'strict' } });

      const result = await service.cancel('booking-1', 'customer-1', {});

      expect(result.data.refund).toMatchObject({ refundTotal: 0, vendorKeeps: 450 });
      expect(StripePayment.refundPaymentIntent).not.toHaveBeenCalled();
    });

    describe('on a payment plan, settles against what was actually paid', () => {
      // $1,000 price, $50 fee; only the 25% deposit ($250 + $50 fee) has been charged
      const deposit = { id: 'i1', status: 'PAID', amount: 300, fee_amount: 50, refunded_amount: 0, kind: 'charge' };
      const balance = { id: 'i2', status: 'SCHEDULED', amount: 750, fee_amount: 0, refunded_amount: 0, kind: 'charge' };
      beforeEach(() => {
        mockPrisma.bookingInstallment.findMany.mockResolvedValue([deposit, balance]);
        mockPayments.refundBooking.mockImplementation((_id: string, amount: number) => Promise.resolve(amount));
      });
      afterEach(() => mockPrisma.bookingInstallment.findMany.mockResolvedValue([]));

      it('customer cancels with nothing refundable: the vendor keeps the deposit, never the unpaid balance', async () => {
        mockPrisma.booking.findFirst.mockResolvedValue(paidBooking({ amount: 1000, service_fee: 50 }));
        mockPrisma.bookingContract.findFirst.mockResolvedValue({ merge_data: { cancellation_policy: 'strict' } });

        const result = await service.cancel('booking-1', 'customer-1', {});

        expect(result.data.refund).toMatchObject({ refundTotal: 0, vendorKeeps: 250 });
        expect(mockPayments.voidOpenCharges).toHaveBeenCalledWith('booking-1');
        expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'vendor-1' }, data: { balance: { increment: 250 } } });
      });

      it('customer cancels at 50%: owed $500 but only $250 was paid, so the vendor keeps $250 and nothing is refunded', async () => {
        mockPrisma.booking.findFirst.mockResolvedValue(paidBooking({ amount: 1000, service_fee: 50 }));

        const result = await service.cancel('booking-1', 'customer-1', {});

        expect(result.data.refund).toMatchObject({ refundTotal: 0, vendorKeeps: 250, percent: 50 });
        expect(mockPayments.refundBooking).not.toHaveBeenCalled();
      });

      it('customer cancels with a full refund: the deposit comes back, the Vendly Protection fee stays', async () => {
        mockPrisma.booking.findFirst.mockResolvedValue(paidBooking({ amount: 1000, service_fee: 50, event_start_at: new Date(Date.now() + 30 * DAY) }));

        const result = await service.cancel('booking-1', 'customer-1', {});

        expect(result.data.refund).toMatchObject({ refundTotal: 250, refundFee: 0, vendorKeeps: 0 });
        expect(mockPayments.refundBooking).toHaveBeenCalledWith('booking-1', 250, 'cancel-booking-1', { keepFees: true });
      });

      it('vendor cancels: everything paid comes back, fee included, and nothing more is charged', async () => {
        mockPrisma.booking.findFirst.mockResolvedValue(paidBooking({ amount: 1000, service_fee: 50 }));

        const result = await service.cancel('booking-1', 'vendor-1', {});

        expect(result.data.refund).toMatchObject({ refundTotal: 300, refundFee: 50, vendorKeeps: 0 });
        expect(mockPayments.refundBooking).toHaveBeenCalledWith('booking-1', 300, 'cancel-booking-1', { keepFees: false });
        expect(mockPayments.voidOpenCharges).toHaveBeenCalled();
      });

      it('cancels add-ons and fees still waiting on the customer', async () => {
        mockPrisma.booking.findFirst.mockResolvedValue(paidBooking({ amount: 1000, service_fee: 50 }));
        await service.cancel('booking-1', 'vendor-1', {});
        expect(mockPrisma.bookingExtra.updateMany).toHaveBeenCalledWith({ where: { booking_id: 'booking-1', status: { in: ['PENDING', 'IN_REVIEW'] } }, data: { status: 'CANCELLED' } });
      });
    });

    it('releases a card hold when an unpaid (pay-after-service) booking is cancelled', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.CONFIRMED, paid_at: null });
      await service.cancel('booking-1', 'customer-1', {});
      expect(mockPayments.voidOpenCharges).toHaveBeenCalledWith('booking-1');
    });

    it('records a failed refund instead of losing it', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(paidBooking());
      (StripePayment.refundPaymentIntent as jest.Mock).mockRejectedValue(new Error('card network down'));
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      const result = await service.cancel('booking-1', 'vendor-1', {});

      expect(result.success).toBe(true);
      expect(mockPrisma.paymentTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'booking_refund', status: 'refund_failed' }) }),
      );
    });

    it('records only what was not refunded and does not tell the customer it is on its way', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(paidBooking({ payment_transaction_id: null }));
      const deposit = { status: 'PAID', amount: 247.5, fee_amount: 22.5, refunded_amount: 0, kind: 'charge', capture_manually: false, payment_intent_id: 'pi_1' };
      const balance = { status: 'PAID', amount: 225, fee_amount: 0, refunded_amount: 0, kind: 'charge', capture_manually: false, payment_intent_id: 'pi_2' };
      mockPrisma.bookingInstallment.findMany.mockResolvedValueOnce([deposit, balance]);
      // the balance came back, then Stripe failed on the deposit
      mockPayments.refundBooking.mockRejectedValueOnce(new Error('card network down'));
      (mockPrisma.bookingInstallment as any).aggregate = jest.fn().mockResolvedValue({ _sum: { refunded_amount: 225 } });
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      const result = await service.cancel('booking-1', 'vendor-1', {});

      expect(mockPrisma.paymentTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'booking_refund', status: 'refund_failed', amount: 247.5 }) }),
      );
      expect(result.data.refund_summary).toMatchObject({ refund_total: 225, refund_failed: 247.5 });
      const email = mockMail.sendBookingNotification.mock.calls.find((c: any) => c[0].to === 'customer@test.com')[0];
      expect(email.message).toContain("We couldn't refund $247.50 to your card straight away. Vendly will follow up with you about it.");
      expect(email.message).toContain('$225.00 is being refunded');
      const pushed = mockPush.sendToUser.mock.calls.find((c: any) => c[0] === 'customer-1')[1];
      expect(pushed.body).not.toContain('is being refunded to your card (');
      delete (mockPrisma.bookingInstallment as any).aggregate;
    });

    it('refuses to cancel while a dispute is open', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(paidBooking({ status: BookingStatus.IN_PROGRESS, dispute_opened_at: new Date(), dispute_resolved_at: null }));
      await expect(service.cancel('booking-1', 'customer-1', {})).rejects.toThrow('open dispute');
      await expect(service.cancel('booking-1', 'vendor-1', {})).rejects.toThrow('open dispute');
      await expect(service.cancelPreview('booking-1', 'customer-1')).rejects.toThrow('open dispute');
      expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
      expect(mockPayments.refundBooking).not.toHaveBeenCalled();
    });

    it('only claims the cancellation while no dispute is open', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.CONFIRMED, paid_at: null });
      await service.cancel('booking-1', 'customer-1', {});
      expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ OR: [{ dispute_opened_at: null }, { dispute_resolved_at: { not: null } }] }),
      }));
    });

    it('refuses a second, simultaneous cancellation', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(paidBooking());
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.cancel('booking-1', 'vendor-1', {})).rejects.toThrow(BadRequestException);
      expect(StripePayment.refundPaymentIntent).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException for unrelated user', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);

      await expect(service.cancel('booking-1', 'random-user', {})).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when booking is already completed', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.COMPLETED,
      });

      await expect(service.cancel('booking-1', 'customer-1', {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('getBooking', () => {
    it('should return booking for the customer', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);

      const result = await service.getBooking('booking-1', 'customer-1');
      expect(result.success).toBe(true);
    });

    it('should throw ForbiddenException for unrelated user', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);

      await expect(service.getBooking('booking-1', 'random-user')).rejects.toThrow(ForbiddenException);
    });

    describe('same-day warning for the vendor', () => {
      // a request for 6–11pm Chicago time on Dec 5
      const request = { ...mockBooking, event_start_at: new Date('2026-12-06T00:00:00Z'), event_end_at: new Date('2026-12-06T05:00:00Z'), scheduled_at: null };
      beforeEach(() => {
        mockPrisma.booking.findFirst.mockResolvedValue(request);
        mockPrisma.bookingContract.findFirst.mockResolvedValue({ merge_data: { timezone: 'America/Chicago' } });
      });
      afterEach(() => mockPrisma.booking.findMany.mockReset());

      it('lists confirmed bookings on the same local day, not ones that only share the UTC date', async () => {
        mockPrisma.booking.findMany.mockResolvedValue([
          // Dec 5, 10am Chicago: same day
          { id: 'b2', status: BookingStatus.CONFIRMED, event_start_at: new Date('2026-12-05T16:00:00Z'), event_end_at: new Date('2026-12-05T18:00:00Z'), scheduled_at: null, listing: { title: 'Brunch' } },
          // Dec 6, 10am Chicago: same UTC date as the request, different local day
          { id: 'b3', status: BookingStatus.CONFIRMED, event_start_at: new Date('2026-12-06T16:00:00Z'), event_end_at: null, scheduled_at: null, listing: { title: 'Lunch' } },
        ]);
        const res = await service.getBooking('booking-1', 'vendor-1');
        expect(res.data.same_day_bookings).toEqual([expect.objectContaining({ id: 'b2', title: 'Brunch' })]);
        expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ vendor_id: 'vendor-1', status: { in: ['CONFIRMED', 'IN_PROGRESS'] } }) }));
      });

      it('is only worked out for the vendor, and only on a request', async () => {
        await service.getBooking('booking-1', 'customer-1');
        mockPrisma.booking.findFirst.mockResolvedValue({ ...request, status: BookingStatus.CONFIRMED });
        await service.getBooking('booking-1', 'vendor-1');
        expect(mockPrisma.booking.findMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('push notifications', () => {
    it('pushes the customer when a booking is confirmed', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPrisma.booking.update.mockResolvedValue({ ...mockBooking, status: BookingStatus.CONFIRMED });
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });

      await service.confirm('booking-1', 'vendor-1');

      expect(mockPush.sendToUser).toHaveBeenCalledWith(
        'customer-1',
        expect.objectContaining({ title: 'Booking confirmed' }),
        'booking_updates',
      );
    });

    it('pushes the other party on cancellation', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });

      await service.cancel('booking-1', 'customer-1', {} as any);

      expect(mockPush.sendToUser).toHaveBeenCalledWith('vendor-1', expect.anything(), 'booking_updates');
    });
  });

  describe('proofs', () => {
    const photo = { originalname: 'a.jpg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]) } as Express.Multer.File;

    it('lets a booking participant upload proof photos', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPrisma.bookingProof.create.mockImplementation(({ data }) => Promise.resolve({ id: 'p1', ...data }));

      const res = await service.uploadProof('booking-1', 'vendor-1', [photo], 'done');

      expect(TanvirStorage.put).toHaveBeenCalledTimes(1);
      expect(res.data.photos[0]).toMatch(/^https:\/\/cdn\.test\/proofs\/[0-9a-f]{24}\.jpg$/);
      expect(mockPrisma.bookingProof.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ uploader_id: 'vendor-1', notes: 'done' }) }),
      );
    });

    it('rejects proof upload from an unrelated user', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      await expect(service.uploadProof('booking-1', 'stranger', [photo])).rejects.toThrow(ForbiddenException);
    });

    it('requires at least one photo', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      await expect(service.uploadProof('booking-1', 'vendor-1', [])).rejects.toThrow(BadRequestException);
    });

    it('refuses a proof that is not really a photo, whatever it is called', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      const fake = { originalname: 'x.jpg', buffer: Buffer.from('<html><script>alert(1)</script>') } as Express.Multer.File;
      await expect(service.uploadProof('booking-1', 'vendor-1', [photo, fake])).rejects.toThrow(BadRequestException);
      expect(TanvirStorage.put).not.toHaveBeenCalled();
      expect(mockPrisma.bookingProof.create).not.toHaveBeenCalled();
    });

    it('hides proofs from unrelated users', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      await expect(service.getProofs('booking-1', 'stranger')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deliverables', () => {
    beforeEach(() => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPrisma.bookingDeliverable.create.mockImplementation(({ data }) => Promise.resolve({ id: 'd1', ...data }));
    });

    it('only allows the booking vendor to send deliverables', async () => {
      await expect(
        service.sendDeliverable('booking-1', 'customer-1', [], { title: 'x' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('accepts links as a JSON string (multipart) or an array (JSON body)', async () => {
      await service.sendDeliverable('booking-1', 'vendor-1', [], {
        title: 'Photos',
        links: JSON.stringify(['https://a.test/1']),
      });
      await service.sendDeliverable('booking-1', 'vendor-1', [], {
        title: 'Photos',
        links: ['https://a.test/2'],
      });

      const calls = mockPrisma.bookingDeliverable.create.mock.calls;
      expect(calls[0][0].data.links).toEqual(['https://a.test/1']);
      expect(calls[1][0].data.links).toEqual(['https://a.test/2']);
    });

    it('drops non-http(s) links such as javascript: URLs', async () => {
      await service.sendDeliverable('booking-1', 'vendor-1', [], {
        title: 'x',
        links: ['javascript:alert(1)', 'https://ok.test', 'ftp://nope'],
      });

      expect(mockPrisma.bookingDeliverable.create.mock.calls[0][0].data.links).toEqual(['https://ok.test']);
    });

    it('stores delivered files under random names by their real type and refuses others', async () => {
      const pdf = { originalname: '../../evil.html', buffer: Buffer.from('%PDF-1.7\n') } as Express.Multer.File;
      const res = await service.sendDeliverable('booking-1', 'vendor-1', [pdf], { title: 'Contract' });
      const stored = mockPrisma.bookingDeliverable.create.mock.calls[0][0].data.files;
      expect(stored).toEqual([expect.stringMatching(/^[0-9a-f]{24}\.pdf$/)]);
      expect(TanvirStorage.put).toHaveBeenCalledWith(`deliverables/${stored[0]}`, pdf.buffer);
      expect(JSON.stringify(res)).not.toContain('evil');

      const exe = { originalname: 'photos.zip', buffer: Buffer.from('MZ\x90\x00') } as Express.Multer.File;
      await expect(service.sendDeliverable('booking-1', 'vendor-1', [exe], { title: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('pushes the customer when a deliverable is sent', async () => {
      await service.sendDeliverable('booking-1', 'vendor-1', [], { title: 'Final files' });
      expect(mockPush.sendToUser).toHaveBeenCalledWith(
        'customer-1',
        expect.objectContaining({ title: 'New deliverable', body: 'Final files' }),
        'booking_updates',
      );
    });
  });

  describe('start and complete', () => {
    beforeEach(() => mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 }));

    it('lets the vendor start before the event (setting up early) but not complete it', async () => {
      const soon = new Date(Date.now() + 2 * 3600 * 1000);
      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.CONFIRMED, event_start_at: soon });
      await service.startWork('booking-1', 'vendor-1');
      expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: 'booking-1', status: BookingStatus.CONFIRMED }, data: { status: BookingStatus.IN_PROGRESS } });

      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.IN_PROGRESS, event_start_at: soon });
      await expect(service.complete('booking-1', 'vendor-1')).rejects.toThrow('once the event has started');
      // a booking with only a scheduled time counts from that
      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.IN_PROGRESS, event_start_at: null, scheduled_at: soon });
      await expect(service.complete('booking-1', 'vendor-1')).rejects.toThrow('once the event has started');
      expect(mockPayments.onBookingCompleted).not.toHaveBeenCalled();
    });

    it('does not overwrite a cancellation that landed in the meantime', async () => {
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.IN_PROGRESS, event_start_at: new Date(Date.now() - 3600 * 1000) });
      await expect(service.complete('booking-1', 'vendor-1')).rejects.toThrow('changed in the meantime');
      expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'booking-1', status: BookingStatus.IN_PROGRESS } }));
      expect(mockPayments.onBookingCompleted).not.toHaveBeenCalled();

      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.CONFIRMED });
      await expect(service.startWork('booking-1', 'vendor-1')).rejects.toThrow('changed in the meantime');
    });
  });

  describe('payment', () => {
    it('refuses checkout before the vendor accepts and signs', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.PENDING });
      await expect(service.createCheckoutSession('booking-1', 'customer-1')).rejects.toThrow(/accepts and signs/);
      expect(StripePayment.createCheckoutSessionForBooking).not.toHaveBeenCalled();
    });

    it('refuses to take a second payment', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.CONFIRMED, paid_at: new Date() });
      await expect(service.createCheckoutSession('booking-1', 'customer-1')).rejects.toThrow(/already paid/);
    });

    it('charges the vendor price plus the customer service fee once confirmed', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.CONFIRMED, paid_at: null, service_fee: 5 });
      const res = await service.createCheckoutSession('booking-1', 'customer-1');
      expect(res.data.checkout_url).toBe('https://checkout.test/cs_1');
      expect(StripePayment.createCheckoutSessionForBooking).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 100, serviceFee: 5, bookingId: 'booking-1' }),
      );
    });

    it('holds the money on completion and starts the release clock instead of paying the vendor at once', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.IN_PROGRESS });
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });

      await service.complete('booking-1', 'vendor-1');

      const completedAt = mockPrisma.booking.updateMany.mock.calls[0][0].data.completed_at;
      expect(mockPayments.onBookingCompleted).toHaveBeenCalledWith('booking-1', completedAt);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('does not credit unpaid or already-credited bookings', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.IN_PROGRESS });
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.booking.update.mockResolvedValue({ ...mockBooking, status: BookingStatus.COMPLETED });

      mockPrisma.booking.findUnique.mockResolvedValueOnce({ status: BookingStatus.COMPLETED, paid_at: null, payout_credited_at: null, amount: 100, vendor_id: 'vendor-1' });
      await service.complete('booking-1', 'vendor-1');
      mockPrisma.booking.findUnique.mockResolvedValueOnce({ status: BookingStatus.COMPLETED, paid_at: new Date(), payout_credited_at: new Date(), amount: 100, vendor_id: 'vendor-1' });
      await service.complete('booking-1', 'vendor-1');

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('recordPayment (Stripe webhook)', () => {
    const session = { id: 'cs_paid', payment_intent: 'pi_1', amount_total: 10500, currency: 'usd', metadata: { booking_id: 'booking-1' } };

    beforeEach(() => {
      mockPrisma.paymentTransaction.findFirst.mockResolvedValue(null);
      mockPrisma.booking.findUnique.mockResolvedValue({ customer_id: 'customer-1', currency: 'usd', status: BookingStatus.CONFIRMED, paid_at: new Date(), amount: 100, vendor_id: 'vendor-1' });
    });

    it('marks the booking paid and records the payment without changing its status', async () => {
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });
      await service.recordPayment(session);
      expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: 'booking-1', paid_at: null }, data: { paid_at: expect.any(Date) } });
      expect(mockPrisma.paymentTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'booking_payment', amount: 105, reference_number: 'cs_paid' }) }),
      );
      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
      expect(StripePayment.refundPaymentIntent).not.toHaveBeenCalled();
    });

    it('ignores a retried webhook for the same session', async () => {
      mockPrisma.paymentTransaction.findFirst.mockResolvedValue({ id: 't1' });
      await service.recordPayment(session);
      expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
      expect(StripePayment.refundPaymentIntent).not.toHaveBeenCalled();
    });

    it('does not refund when a concurrent delivery of the same session already recorded it', async () => {
      mockPrisma.paymentTransaction.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 't1' });
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 0 });
      await service.recordPayment(session);
      expect(mockPrisma.paymentTransaction.create).not.toHaveBeenCalled();
      expect(StripePayment.refundPaymentIntent).not.toHaveBeenCalled();
    });

    it('refunds in full a payment that lands on an already-cancelled booking', async () => {
      mockPrisma.booking.findUnique.mockResolvedValueOnce({ customer_id: 'customer-1', currency: 'usd', status: BookingStatus.CANCELLED });
      await service.recordPayment({ ...session, id: 'cs_late', payment_intent: 'pi_late' });
      expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
      expect(StripePayment.refundPaymentIntent).toHaveBeenCalledWith('pi_late', 'late-cs_late');
      expect(mockPrisma.paymentTransaction.updateMany).toHaveBeenCalledWith({ where: { reference_number: 'cs_late' }, data: { status: 'refunded' } });
    });

    it('refunds a second payment for an already-paid booking', async () => {
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 0 });
      await service.recordPayment({ ...session, id: 'cs_second', payment_intent: 'pi_2' });
      expect(StripePayment.refundPaymentIntent).toHaveBeenCalledWith('pi_2', 'duplicate-cs_second');
      expect(mockPrisma.paymentTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'booking_payment_duplicate' }) }),
      );
      expect(mockPrisma.paymentTransaction.updateMany).toHaveBeenCalledWith({ where: { reference_number: 'cs_second' }, data: { status: 'refunded' } });
    });

    it('tries a refund again when Stripe retries the webhook and it is still pending', async () => {
      mockPrisma.paymentTransaction.findFirst.mockResolvedValue({ id: 't1', type: 'booking_payment_duplicate', status: 'refund_pending' });
      await service.recordPayment({ ...session, id: 'cs_second', payment_intent: 'pi_2' });
      expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.paymentTransaction.create).not.toHaveBeenCalled();
      // same key as the first try: Stripe never refunds it twice
      expect(StripePayment.refundPaymentIntent).toHaveBeenCalledWith('pi_2', 'duplicate-cs_second');
      expect(mockPrisma.paymentTransaction.updateMany).toHaveBeenCalledWith({ where: { reference_number: 'cs_second' }, data: { status: 'refunded' } });

      jest.clearAllMocks();
      mockPrisma.paymentTransaction.findFirst.mockResolvedValue({ id: 't2', type: 'booking_payment_after_cancel', status: 'refund_pending' });
      await service.recordPayment({ ...session, id: 'cs_late', payment_intent: 'pi_late' });
      expect(StripePayment.refundPaymentIntent).toHaveBeenCalledWith('pi_late', 'late-cs_late');
    });

    it('credits the vendor when payment arrives after the booking was completed', async () => {
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.booking.findUnique
        .mockResolvedValueOnce({ customer_id: 'customer-1', currency: 'usd' })
        .mockResolvedValueOnce({ status: BookingStatus.COMPLETED, paid_at: new Date(), payout_credited_at: null, amount: 100, currency: 'usd', vendor_id: 'vendor-1' });
      await service.recordPayment(session);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'vendor-1' }, data: { balance: { increment: 100 } } });
    });
  });

  it('reuses an open checkout session instead of creating a second one', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.CONFIRMED, paid_at: null, payment_transaction_id: 'cs_open' });
    (StripePayment.retrieveCheckoutSession as jest.Mock).mockResolvedValue({ status: 'open', url: 'https://checkout.test/cs_open' });
    const res = await service.createCheckoutSession('booking-1', 'customer-1');
    expect(res.data.checkout_url).toBe('https://checkout.test/cs_open');
    expect(StripePayment.createCheckoutSessionForBooking).not.toHaveBeenCalled();
  });

  it('refuses a checkout for a booking on a payment schedule', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.CONFIRMED, paid_at: null, service_fee: 5 });
    mockPrisma.bookingInstallment.count.mockResolvedValueOnce(2);
    await expect(service.createCheckoutSession('booking-1', 'customer-1')).rejects.toThrow('paid through its payment schedule');
    expect(StripePayment.createCheckoutSessionForBooking).not.toHaveBeenCalled();
  });

  it('lets customers pay a completed booking that is still unpaid', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.COMPLETED, paid_at: null, service_fee: 5 });
    const res = await service.createCheckoutSession('booking-1', 'customer-1');
    expect(res.data.checkout_url).toBe('https://checkout.test/cs_1');
  });

  describe('cancel preview: shows exactly what cancelling does', () => {
    const DAY = 24 * 3600 * 1000;
    // a booking paid in full through hosted Checkout (no installments): $450 + $22.50 fee
    const legacyPaid = (overrides: Record<string, unknown> = {}) => ({
      ...mockBooking,
      status: BookingStatus.CONFIRMED,
      amount: 450,
      service_fee: 22.5,
      currency: 'usd',
      paid_at: new Date(),
      payment_transaction_id: 'cs_paid',
      event_start_at: new Date(Date.now() + 3 * DAY),
      ...overrides,
    });

    beforeEach(() => {
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });
      (StripePayment.retrieveCheckoutSession as jest.Mock).mockResolvedValue({ payment_intent: 'pi_paid' });
      (StripePayment.refundPaymentIntent as jest.Mock).mockResolvedValue({ id: 're_1' });
      mockPrisma.bookingContract.findFirst.mockResolvedValue({ merge_data: { cancellation_policy: 'flexible' } });
      mockPayments.refundBooking.mockImplementation((_id: string, amount: number) => Promise.resolve(amount));
      mockPayments.cardLabel.mockResolvedValue(null);
    });
    afterEach(() => {
      mockPrisma.bookingInstallment.findMany.mockResolvedValue([]);
      mockPayments.cardLabel.mockResolvedValue(null);
    });

    /** Previews, then really cancels with the same data, and returns both plus what actually moved. */
    const previewThenCancel = async (userId: string) => {
      const preview = (await service.cancelPreview('booking-1', userId)).data;
      expect(StripePayment.refundPaymentIntent).not.toHaveBeenCalled();
      expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
      const result = await service.cancel('booking-1', userId, {});
      const legacyRefund = (StripePayment.refundPaymentIntent as jest.Mock).mock.calls[0]?.[2] ?? 0;
      const engineRefund = mockPayments.refundBooking.mock.calls[0]?.[1] ?? 0;
      const credited = mockPrisma.user.update.mock.calls[0]?.[0]?.data?.balance?.increment ?? 0;
      return { preview, result: result.data as any, refunded: legacyRefund || engineRefund, credited };
    };

    const expectSame = ({ preview, result, refunded, credited }: Awaited<ReturnType<typeof previewThenCancel>>) => {
      expect(preview.refund_total).toBe(result.refund.refundTotal);
      expect(preview.refund_fee).toBe(result.refund.refundFee);
      expect(preview.vendor_keeps).toBe(result.refund.vendorKeeps);
      expect(preview.percent).toBe(result.refund.percent);
      expect(refunded).toBe(preview.refund_total);
      expect(credited).toBe(preview.vendor_keeps);
      const { message: _a, ...previewNumbers } = preview;
      const { message: _b, ...doneNumbers } = result.refund_summary;
      expect(doneNumbers).toEqual(previewNumbers);
    };

    it('vendor cancels: everything back, Vendly Protection fee included', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(legacyPaid());
      const out = await previewThenCancel('vendor-1');
      expectSame(out);
      expect(out.preview).toMatchObject({ cancelled_by: 'VENDOR', refund_total: 472.5, refund_fee: 22.5, vendor_keeps: 0, fee_kept: 0 });
      expect(out.preview.message).toBe('The customer gets $472.50 back, Vendly Protection fee included. You keep nothing from this booking.');
    });

    it('customer cancels in time for a full refund: the price back, the fee kept', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(legacyPaid({ event_start_at: new Date(Date.now() + 30 * DAY) }));
      const out = await previewThenCancel('customer-1');
      expectSame(out);
      expect(out.preview).toMatchObject({ refund_total: 450, fee_kept: 22.5, vendor_keeps: 0, percent: 100, policy: { key: 'flexible', label: 'Flexible' } });
      expect(out.preview.message).toBe("You'll get $450.00 back to your card. The $22.50 Vendly Protection fee isn't refunded. Refunds take 5–10 business days to show.");
    });

    it('customer cancels inside the 50% window', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(legacyPaid());
      mockPayments.cardLabel.mockResolvedValue('Visa •••• 4242');
      const out = await previewThenCancel('customer-1');
      expectSame(out);
      expect(out.preview).toMatchObject({ refund_total: 225, vendor_keeps: 225, percent: 50, card: 'Visa •••• 4242', refund_timing: '5–10 business days' });
      expect(out.preview.message).toBe(
        "You'll get $225.00 back to your card (Visa •••• 4242). The $22.50 Vendly Protection fee isn't refunded. The vendor keeps $225.00 under their flexible cancellation policy. Refunds take 5–10 business days to show.",
      );
    });

    it('customer cancels too late for any refund', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(legacyPaid());
      mockPrisma.bookingContract.findFirst.mockResolvedValue({ merge_data: { cancellation_policy: 'strict' } });
      const out = await previewThenCancel('customer-1');
      expectSame(out);
      expect(out.preview).toMatchObject({ refund_total: 0, vendor_keeps: 450, percent: 0, refund_timing: null });
      expect(out.preview.message).toMatch(/^You won't get a refund\./);
    });

    describe('deposit only paid (payment plan)', () => {
      // $1,000 price, $50 fee; the 25% deposit ($250 + $50 fee) is paid, the $750 balance isn't
      const deposit = { id: 'i1', status: 'PAID', amount: 300, fee_amount: 50, refunded_amount: 0, kind: 'charge', capture_manually: false, payment_intent_id: 'pi_dep' };
      const balance = { id: 'i2', status: 'SCHEDULED', amount: 750, fee_amount: 0, refunded_amount: 0, kind: 'charge', capture_manually: false, payment_intent_id: null };
      beforeEach(() => mockPrisma.bookingInstallment.findMany.mockResolvedValue([deposit, balance]));

      it('customer cancels at 50%: the vendor keeps the deposit, the balance is never charged', async () => {
        mockPrisma.booking.findFirst.mockResolvedValue(legacyPaid({ amount: 1000, service_fee: 50 }));
        const out = await previewThenCancel('customer-1');
        expectSame(out);
        expect(out.preview).toMatchObject({ refund_total: 0, vendor_keeps: 250, fee_kept: 50, unpaid_cancelled: 750 });
        expect(out.preview.message).toContain("The $750.00 still to pay won't be charged.");
      });

      it('customer cancels with a full refund: the deposit comes back, the fee stays', async () => {
        mockPrisma.booking.findFirst.mockResolvedValue(legacyPaid({ amount: 1000, service_fee: 50, event_start_at: new Date(Date.now() + 40 * DAY) }));
        const out = await previewThenCancel('customer-1');
        expectSame(out);
        expect(out.preview).toMatchObject({ refund_total: 250, vendor_keeps: 0, fee_kept: 50 });
      });

      it('vendor cancels: the whole deposit back, fee included', async () => {
        mockPrisma.booking.findFirst.mockResolvedValue(legacyPaid({ amount: 1000, service_fee: 50 }));
        const out = await previewThenCancel('vendor-1');
        expectSame(out);
        expect(out.preview).toMatchObject({ refund_total: 300, refund_fee: 50, vendor_keeps: 0, unpaid_cancelled: 750 });
      });
    });

    it('nothing paid yet: no refund, and a pay-after-service hold is released', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({ ...legacyPaid(), paid_at: null, payment_transaction_id: null });
      mockPrisma.bookingInstallment.findMany.mockResolvedValue([{ id: 'h', status: 'PROCESSING', amount: 472.5, fee_amount: 22.5, refunded_amount: 0, kind: 'charge', capture_manually: true, payment_intent_id: 'pi_hold' }]);
      const out = await previewThenCancel('customer-1');
      expect(out.preview).toMatchObject({ refund_total: 0, vendor_keeps: 0, holds_released: 472.5 });
      expect(out.result.refund).toBeNull();
      expect(out.preview.message).toBe("You haven't been charged, so there's nothing to refund. The $472.50 hold on your card will be released.");
      expect(mockPayments.voidOpenCharges).toHaveBeenCalledWith('booking-1');
    });

    it('past the start of a booking the vendor never started, points the customer to Report a problem (cancelling stays possible)', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(legacyPaid({ event_start_at: new Date(Date.now() - 3 * 3600 * 1000) }));
      const preview = (await service.cancelPreview('booking-1', 'customer-1')).data as any;
      expect(preview.percent).toBe(0);
      expect(preview.report_problem_hint).toContain('report a problem instead');
      // the vendor's own preview, a booking that hasn't started yet, or one in progress get no hint
      expect(((await service.cancelPreview('booking-1', 'vendor-1')).data as any).report_problem_hint).toBeUndefined();
      mockPrisma.booking.findFirst.mockResolvedValue(legacyPaid());
      expect(((await service.cancelPreview('booking-1', 'customer-1')).data as any).report_problem_hint).toBeUndefined();
      mockPrisma.booking.findFirst.mockResolvedValue(legacyPaid({ status: BookingStatus.IN_PROGRESS, event_start_at: new Date(Date.now() - 3 * 3600 * 1000) }));
      expect(((await service.cancelPreview('booking-1', 'customer-1')).data as any).report_problem_hint).toBeUndefined();
    });

    it('refuses a preview for someone else or a booking that can no longer be cancelled', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(legacyPaid());
      await expect(service.cancelPreview('booking-1', 'stranger')).rejects.toThrow(ForbiddenException);
      mockPrisma.booking.findFirst.mockResolvedValue(legacyPaid({ status: BookingStatus.COMPLETED }));
      await expect(service.cancelPreview('booking-1', 'customer-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancellation notices', () => {
    beforeEach(() => {
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });
      (StripePayment.retrieveCheckoutSession as jest.Mock).mockResolvedValue({ payment_intent: 'pi_paid' });
      (StripePayment.refundPaymentIntent as jest.Mock).mockResolvedValue({ id: 're_1' });
      mockPrisma.bookingContract.findFirst.mockResolvedValue({ merge_data: { cancellation_policy: 'flexible' } });
      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.CONFIRMED, amount: 450, service_fee: 22.5, paid_at: new Date(), payment_transaction_id: 'cs_paid', event_start_at: new Date(Date.now() + 3 * 24 * 3600 * 1000) });
    });

    it('vendor cancels: the customer is emailed and pushed the refund amount and timing', async () => {
      await service.cancel('booking-1', 'vendor-1', { reason: 'Double booked' });
      expect(mockMail.sendBookingNotification).toHaveBeenCalledTimes(1);
      expect(mockMail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({
        to: 'customer@test.com',
        message: expect.stringContaining('$472.50 is being refunded to your card'),
        lines: expect.arrayContaining([{ label: 'Refund', value: '$472.50' }, { label: 'When', value: 'Within 5–10 business days' }]),
      }));
      expect(mockPush.sendToUser).toHaveBeenCalledWith('customer-1', expect.objectContaining({ body: expect.stringContaining('$472.50 is being refunded') }), 'booking_updates');
      // the refund email is never optional
      expect(mockMail.sendBookingNotification.mock.calls[0][0].topic).toBeUndefined();
      expect(mockPayments.sendFinalInvoice).toHaveBeenCalledWith('booking-1');
    });

    it('customer cancels: both are told, each in their own words', async () => {
      await service.cancel('booking-1', 'customer-1', {});
      expect(mockMail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ to: 'customer@test.com', message: expect.stringContaining("The $22.50 Vendly Protection fee isn't refunded.") }));
      expect(mockMail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ to: 'vendor@test.com', message: expect.stringContaining('You keep $225.00 under your flexible cancellation policy.') }));
      expect(mockPush.sendToUser).toHaveBeenCalledWith('customer-1', expect.anything(), 'booking_updates');
      expect(mockPush.sendToUser).toHaveBeenCalledWith('vendor-1', expect.anything(), 'booking_updates');
    });

    it('an unpaid booking gets no invoice', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.CONFIRMED, paid_at: null });
      await service.cancel('booking-1', 'customer-1', {});
      expect(mockPayments.sendFinalInvoice).not.toHaveBeenCalled();
    });
  });

  describe('legacy Checkout bookings credited after completion', () => {
    const { __setFeeCache } = require('src/modules/platform/platform-settings.service');
    afterEach(() => __setFeeCache(null));
    const session = { id: 'cs_paid', payment_intent: 'pi_1', amount_total: 10500, currency: 'usd', metadata: { booking_id: 'booking-1' } };

    it('takes the current Vendly commission, like a regular payout', async () => {
      __setFeeCache({ percent: 5, minimum: 3, commission: 10, categories: new Map() });
      mockPrisma.paymentTransaction.findFirst.mockResolvedValue(null);
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.booking.findUnique
        .mockResolvedValueOnce({ customer_id: 'customer-1', currency: 'usd' })
        .mockResolvedValueOnce({ status: BookingStatus.COMPLETED, paid_at: new Date(), payout_credited_at: null, amount: 100, currency: 'usd', vendor_id: 'vendor-1' });

      await service.recordPayment(session);

      expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith({
        where: { id: 'booking-1', payout_credited_at: null },
        data: { payout_credited_at: expect.any(Date), released_at: expect.any(Date), commission_amount: 10, released_gross: 100 },
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'vendor-1' }, data: { balance: { increment: 90 } } });
      expect(mockPrisma.paymentTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ user_id: 'vendor-1', type: 'vendly_commission', amount: 10, order_id: 'booking-1' }) });
      expect(mockPrisma.paymentTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ user_id: 'vendor-1', type: 'booking_earning', amount: 90 }) });
      expect(mockPayments.sendFinalInvoice).toHaveBeenCalledWith('booking-1');
    });

    it('never credits a booking twice (already credited before the commission rule: untouched)', async () => {
      __setFeeCache({ percent: 5, minimum: 3, commission: 10, categories: new Map() });
      mockPrisma.paymentTransaction.findFirst.mockResolvedValue(null);
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.booking.findUnique
        .mockResolvedValueOnce({ customer_id: 'customer-1', currency: 'usd' })
        .mockResolvedValueOnce({ status: BookingStatus.COMPLETED, paid_at: new Date(), payout_credited_at: new Date('2026-01-01'), amount: 100, currency: 'usd', vendor_id: 'vendor-1' });
      await service.recordPayment(session);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.paymentTransaction.create).not.toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'vendly_commission' }) });
    });
  });
});
