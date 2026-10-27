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
import { MarketplaceService } from 'src/modules/marketplace/marketplace.service';
import { BookingStatus, ListingStatus } from 'prisma/generated/client';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import { deadlineText } from 'src/modules/payments/payment-due';

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
    groupBy: jest.fn().mockResolvedValue([]),
  },
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findMany: jest.fn().mockResolvedValue([{ id: 'admin-1', email: 'admin@vendly.test', name: 'Admin' }]),
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
  hasClearingPayment: jest.fn().mockResolvedValue(false),
  sendFinalInvoice: jest.fn().mockResolvedValue(true),
  // as PaymentsService.checkoutPart with nothing refunded yet
  checkoutPart: jest.fn((_id: string, b: any) =>
    Promise.resolve(b.paid_at && !b.installments?.length ? { paid: Number(b.amount) + Number(b.service_fee ?? 0), vendorPaid: Number(b.amount), refunded: 0 } : null),
  ),
};

const mockContracts = {
  createSignedBooking: jest.fn(),
  countersignForBooking: jest.fn(),
  voidPendingForBooking: jest.fn().mockResolvedValue(0),
};

const mockMarketplace = { similarAvailable: jest.fn().mockResolvedValue([]) };

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
        { provide: MarketplaceService, useValue: mockMarketplace },
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
      expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: 'booking-1', status: BookingStatus.PENDING }, data: { status: BookingStatus.CONFIRMED, confirmed_at: expect.any(Date) } });
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
      expect(tx.booking.updateMany).toHaveBeenCalledWith({ where: { id: 'booking-1', status: BookingStatus.PENDING }, data: { status: BookingStatus.CONFIRMED, confirmed_at: expect.any(Date) } });
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

    it('a bank payment still clearing: the customer waits for it to clear; the vendor can still cancel (refunded in full when it lands)', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPayments.hasClearingPayment.mockResolvedValueOnce(true);
      await expect(service.cancel('booking-1', 'customer-1', { reason_code: 'plans_changed' } as any)).rejects.toThrow('You can cancel once your bank payment clears (about 4 business days). Until then it can’t be settled.');
      mockPayments.hasClearingPayment.mockResolvedValueOnce(true);
      await expect(service.cancelPreview('booking-1', 'customer-1')).rejects.toThrow(/once your bank payment clears/);
      expect(mockPrisma.booking.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }));
      mockPayments.hasClearingPayment.mockResolvedValue(true);
      const res = await service.cancel('booking-1', 'vendor-1', { reason_code: 'emergency' } as any);
      expect(res.success).toBe(true);
      mockPayments.hasClearingPayment.mockResolvedValue(false);
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
      expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: 'booking-1', status: BookingStatus.CONFIRMED }, data: { status: BookingStatus.IN_PROGRESS, started_at: expect.any(Date) } });

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

    it('needs the arrival recorded before the booking can be completed', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.IN_PROGRESS });
      mockPrisma.booking.findUnique.mockResolvedValueOnce({ arrived_at: null, checked_in_at: null, rental_reservations: [], listing: { service_at: 'CUSTOMER_LOCATION', category: null } });
      await expect(service.complete('booking-1', 'vendor-1')).rejects.toThrow('Tap Arrived first');
      expect(mockPrisma.booking.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: BookingStatus.COMPLETED }) }));
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

      const arrived = { arrived_at: new Date(), checked_in_at: null, rental_reservations: [], listing: null };
      mockPrisma.booking.findUnique.mockResolvedValue(arrived);
      await service.complete('booking-1', 'vendor-1');
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
      const { message: _a, reasons: _r, ...previewNumbers } = preview as any;
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

    describe('after an earlier partial refund (a dispute’s $100)', () => {
      // what is left of the $450 + $22.50 Checkout payment: $350 of the price, the fee
      const afterRefund = { paid: 372.5, vendorPaid: 350, refunded: 100 };
      beforeEach(() => mockPayments.checkoutPart.mockResolvedValueOnce(afterRefund).mockResolvedValueOnce(afterRefund));

      it('vendor cancels: only what is left comes back', async () => {
        mockPrisma.booking.findFirst.mockResolvedValue(legacyPaid());
        const out = await previewThenCancel('vendor-1');
        expectSame(out);
        expect(out.preview).toMatchObject({ refund_total: 372.5, refund_fee: 22.5, vendor_keeps: 0 });
        expect(mockPayments.checkoutPart).toHaveBeenCalledWith('booking-1', expect.objectContaining({ id: 'booking-1', installments: [] }));
      });

      it('customer cancels in the 50% window: the policy’s half is kept, the refund already made counts towards the other half', async () => {
        mockPrisma.booking.findFirst.mockResolvedValue(legacyPaid());
        const out = await previewThenCancel('customer-1');
        expectSame(out);
        expect(out.preview).toMatchObject({ refund_total: 125, vendor_keeps: 225, fee_kept: 22.5, percent: 50 });
      });

      it('customer cancels too late for a refund: the vendor keeps only what is left of their price', async () => {
        mockPrisma.booking.findFirst.mockResolvedValue(legacyPaid());
        mockPrisma.bookingContract.findFirst.mockResolvedValue({ merge_data: { cancellation_policy: 'strict' } });
        const out = await previewThenCancel('customer-1');
        expectSame(out);
        expect(out.preview).toMatchObject({ refund_total: 0, vendor_keeps: 350, fee_kept: 22.5, percent: 0 });
      });
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

  describe('cancellation reasons and the deposit rules', () => {
    const DAY = 24 * 3600 * 1000;
    // $1,000 price, $50 fee, 25% deposit plan made under the new rules; the deposit ($250 + $50 fee) is paid
    const deposit = { id: 'i1', sequence: 1, status: 'PAID', amount: 300, fee_amount: 50, refunded_amount: 0, kind: 'charge', capture_manually: false, payment_intent_id: 'pi_dep' };
    const balance = (status = 'SCHEDULED') => ({ id: 'i2', sequence: 2, status, amount: 750, fee_amount: 0, refunded_amount: 0, kind: 'charge', capture_manually: false, payment_intent_id: null });
    const depositPlan = (overrides: Record<string, unknown> = {}) => ({
      ...mockBooking,
      status: BookingStatus.CONFIRMED,
      amount: 1000,
      service_fee: 50,
      currency: 'usd',
      paid_at: new Date(),
      payment_plan: 'DEPOSIT_25',
      deposit_rules: true,
      event_start_at: new Date(Date.now() + 40 * DAY),
      listing: { ...mockBooking.listing, category_id: 'cat-photo' },
      ...overrides,
    });
    const claimData = () => mockPrisma.booking.updateMany.mock.calls.map((c: any) => c[0]).find((a: any) => a.data?.status === BookingStatus.CANCELLED);

    beforeEach(() => {
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.bookingContract.findFirst.mockResolvedValue({ merge_data: { cancellation_policy: 'flexible', timezone: 'America/Chicago' } });
      mockPrisma.bookingInstallment.findMany.mockResolvedValue([deposit, balance()]);
      mockPrisma.bookingInstallment.count.mockResolvedValue(0);
      mockPayments.refundBooking.mockImplementation((_id: string, amount: number) => Promise.resolve(amount));
      mockMarketplace.similarAvailable.mockResolvedValue([]);
      mockPrisma.booking.groupBy.mockResolvedValue([]);
    });
    afterEach(() => mockPrisma.bookingInstallment.findMany.mockResolvedValue([]));

    it('stores the reason picked, the note, who cancelled and when', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      await service.cancel('booking-1', 'customer-1', { reason_code: 'plans_changed', note: ' Moved the party ' });
      expect(claimData().data).toMatchObject({ cancelled_by: 'CUSTOMER', cancel_reason_code: 'plans_changed', cancel_reason: 'Moved the party', cancelled_at: expect.any(Date) });
    });

    it('each side picks from its own list; older apps without a reason count as Other', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      await expect(service.cancel('booking-1', 'customer-1', { reason_code: 'double_booked' })).rejects.toThrow('Pick one of the reasons');
      await expect(service.cancel('booking-1', 'vendor-1', { reason_code: 'found_another_vendor' })).rejects.toThrow('Pick one of the reasons');
      await service.cancel('booking-1', 'vendor-1', { reason: 'Sick' });
      expect(claimData().data).toMatchObject({ cancelled_by: 'VENDOR', cancel_reason_code: 'other', cancel_reason: 'Sick' });
    });

    it('customer cancels a deposit plan inside the full-refund window: the deposit is non-refundable', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(depositPlan());
      const result = await service.cancel('booking-1', 'customer-1', { reason_code: 'event_cancelled' });
      expect(result.data.refund).toMatchObject({ refundTotal: 0, vendorKeeps: 250 });
      expect(result.data.refund_summary).toMatchObject({ deposit_kept: 250, fee_kept: 50, unpaid_cancelled: 750 });
      expect(result.data.refund_summary.message).toContain('Your deposit of $250.00 is non-refundable.');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'vendor-1' }, data: { balance: { increment: 250 } } });
      expect(mockPayments.refundBooking).not.toHaveBeenCalled();
    });

    it('everything paid: the deposit is kept and the rest follows the policy tier', async () => {
      mockPrisma.bookingInstallment.findMany.mockResolvedValue([deposit, balance('PAID')]);
      // flexible, 3 days out: 50% of what was paid beyond the deposit comes back
      mockPrisma.booking.findFirst.mockResolvedValue(depositPlan({ event_start_at: new Date(Date.now() + 3 * DAY) }));
      const result = await service.cancel('booking-1', 'customer-1', { reason_code: 'price' });
      expect(result.data.refund).toMatchObject({ refundTotal: 375, vendorKeeps: 625, percent: 50 });
      expect(mockPayments.refundBooking).toHaveBeenCalledWith('booking-1', 375, 'cancel-booking-1', { keepFees: true });
    });

    it('a custom plan: the first charge (not one the plan replaced) is the deposit; later payments follow the policy', async () => {
      // the plan replaced the unpaid charges of a deposit plan: its first payment ($400 + the $50 fee) and the second ($300) are paid
      mockPrisma.bookingInstallment.findMany.mockResolvedValue([
        { ...deposit, id: 'old', status: 'CANCELLED', payment_intent_id: null },
        { ...deposit, id: 'p1', sequence: 3, amount: 450, payment_intent_id: 'pi_1' },
        { ...balance('PAID'), id: 'p2', sequence: 4, amount: 300, payment_intent_id: 'pi_2' },
        { ...balance(), id: 'p3', sequence: 5, amount: 300 },
      ]);
      // flexible, 3 days out: half of what was paid beyond the deposit comes back
      mockPrisma.booking.findFirst.mockResolvedValue(depositPlan({ payment_plan: 'CUSTOM', deposit_rules: false, event_start_at: new Date(Date.now() + 3 * DAY) }));
      const preview = (await service.cancelPreview('booking-1', 'customer-1')).data as any;
      expect(preview).toMatchObject({ cancelled_by: 'CUSTOMER', deposit_kept: 400, vendor_keeps: 550, refund_total: 150, fee_kept: 50, unpaid_cancelled: 300 });
    });

    it('a booking made before the rules keeps the old refund', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(depositPlan({ deposit_rules: false }));
      const result = await service.cancel('booking-1', 'customer-1', { reason_code: 'event_cancelled' });
      expect(result.data.refund).toMatchObject({ refundTotal: 250, vendorKeeps: 0 });
    });

    it('the vendor may pick "Customer didn’t pay" only while a payment is overdue', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(depositPlan());
      await expect(service.cancel('booking-1', 'vendor-1', { reason_code: 'customer_didnt_pay' })).rejects.toThrow('only while a payment');
      expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
      const preview = (await service.cancelPreview('booking-1', 'vendor-1')).data as any;
      expect(preview.reasons.map((r: any) => r.key)).toEqual(['safety_concern', 'emergency', 'double_booked', 'other']);
    });

    it('the customer’s 12 hours to pay come first: no "Customer didn’t pay" until they are up', async () => {
      const dueBy = new Date(Date.now() + 3 * 3600_000);
      mockPrisma.bookingInstallment.findMany.mockResolvedValue([deposit, balance('FAILED')]);
      // the balance failed for good (no retry left) but the deadline hasn't passed
      mockPrisma.bookingInstallment.count.mockResolvedValue(1);
      mockPrisma.booking.findFirst.mockResolvedValue(depositPlan({ payment_due_by: dueBy, payment_due_kind: 'balance' }));

      const err = await service.cancel('booking-1', 'vendor-1', { reason_code: 'customer_didnt_pay' }).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toBe(`The customer has until ${deadlineText(dueBy, 'America/Chicago')} to pay. If they don't, the booking is cancelled automatically.`);
      expect(err.message).toMatch(/^The customer has until \d{1,2}:\d{2} [AP]M C[DS]T on \w{3}, \w{3} \d{1,2} to pay\./);
      expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
      const preview = (await service.cancelPreview('booking-1', 'vendor-1', 'customer_didnt_pay')).data as any;
      expect(preview.reasons.map((r: any) => r.key)).not.toContain('customer_didnt_pay');
      // previewed as the vendor's own cancellation, since the reason isn't open yet
      expect(preview.cancelled_by).toBe('VENDOR');
    });

    it('"Customer didn’t pay" counts only failed charges towards the price, not add-ons, fees or rental deposits', async () => {
      const rows = [
        { status: 'PAID', kind: 'charge' },
        { status: 'FAILED', kind: 'extra' },
        { status: 'FAILED', kind: 'security_deposit' },
      ];
      mockPrisma.bookingInstallment.count.mockImplementation(({ where }: any) => Promise.resolve(rows.filter((r) => r.status === where.status && (typeof where.kind === 'string' ? r.kind === where.kind : r.kind !== where.kind?.not)).length));
      mockPrisma.bookingInstallment.findMany.mockResolvedValue([]);
      // paid in full on accept; only an add-on and the rental deposit hold failed
      mockPrisma.booking.findFirst.mockResolvedValue(depositPlan({ payment_plan: 'FULL_ON_ACCEPT' }));
      await expect(service.cancel('booking-1', 'vendor-1', { reason_code: 'customer_didnt_pay' })).rejects.toThrow('only while a payment');
      expect((await service.cancelPreview('booking-1', 'vendor-1')).data.reasons.map((r: any) => r.key)).not.toContain('customer_didnt_pay');

      // pay after service: the price charge failed after its retries
      rows[0].status = 'FAILED';
      mockPrisma.booking.findFirst.mockResolvedValue(depositPlan({ payment_plan: 'PAY_AFTER_SERVICE', paid_at: null }));
      expect((await service.cancelPreview('booking-1', 'vendor-1')).data.reasons[0].key).toBe('customer_didnt_pay');
      const result = await service.cancel('booking-1', 'vendor-1', { reason_code: 'customer_didnt_pay' });
      expect(claimData().data).toMatchObject({ cancelled_by: 'VENDOR', cancel_reason_code: 'customer_didnt_pay' });
      expect(result.success).toBe(true);
      mockPrisma.bookingInstallment.count.mockReset();
      mockPrisma.bookingInstallment.count.mockResolvedValue(0);
    });

    it('vendor cancels for non-payment: settled like the customer’s (deposit kept), and not counted against them', async () => {
      mockPrisma.bookingInstallment.findMany.mockResolvedValue([deposit, balance('FAILED')]);
      // the 12 hours to pay are up (the deadline job hasn't run yet)
      mockPrisma.booking.findFirst.mockResolvedValue(depositPlan({ payment_due_by: new Date(Date.now() - 60_000), payment_due_kind: 'balance', event_start_at: new Date(Date.now() + 10 * DAY) }));
      const preview = (await service.cancelPreview('booking-1', 'vendor-1', 'customer_didnt_pay')).data as any;
      expect(preview).toMatchObject({ cancelled_by: 'CUSTOMER', vendor_keeps: 250, deposit_kept: 250 });
      expect(preview.reasons[0]).toEqual({ key: 'customer_didnt_pay', label: 'Customer didn’t pay' });

      const result = await service.cancel('booking-1', 'vendor-1', { reason_code: 'customer_didnt_pay' });

      expect(result.data.refund).toMatchObject({ refundTotal: 0, vendorKeeps: 250 });
      expect(result.data.refund_summary.message).toBe('Nothing is refunded to the customer. You keep the $250.00 deposit. The $750.00 still due won’t be charged.'.replace('won’t', "won't"));
      const toCustomer = mockMail.sendBookingNotification.mock.calls.find((c: any) => c[0].to === 'customer@test.com')[0];
      expect(toCustomer.message).toMatch(/^Vendor cancelled this booking because the payment wasn't made\./);
      expect(toCustomer.message).toContain('Your deposit of $250.00 is non-refundable.');
      expect(toCustomer.reason).toBe('Customer didn’t pay');
      expect(mockMarketplace.similarAvailable).not.toHaveBeenCalled();
      expect(mockPrisma.booking.groupBy).not.toHaveBeenCalled();
    });

    it('cancels for non-payment once the 12 hours are up, as the system, and tells both sides', async () => {
      const now = new Date();
      mockPrisma.bookingInstallment.findMany.mockResolvedValue([{ ...deposit, status: 'FAILED' }, balance()]);
      mockPrisma.booking.findFirst.mockResolvedValue(depositPlan({ paid_at: null, payment_due_by: new Date(now.getTime() - 60_000), payment_due_kind: 'deposit' }));

      const result = await service.cancelForNonPayment('booking-1', now);

      expect(result?.success).toBe(true);
      expect(claimData()).toMatchObject({
        where: expect.objectContaining({ payment_due_by: { lte: now } }),
        data: expect.objectContaining({ cancelled_by: 'SYSTEM', cancel_reason_code: 'non_payment', payment_due_by: null }),
      });
      expect(mockContracts.voidPendingForBooking).toHaveBeenCalledWith('booking-1', 'Booking cancelled', null);
      expect(mockMail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ to: 'customer@test.com', message: expect.stringMatching(/^We cancelled this booking because the deposit wasn't paid in time\./), reason: 'Payment not made in time' }));
      expect(mockMail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ to: 'vendor@test.com', message: expect.stringContaining("the customer didn't pay the deposit in time") }));
      expect(mockPush.sendToUser).toHaveBeenCalledWith('vendor-1', expect.objectContaining({ body: expect.stringContaining("didn't pay the deposit in time") }), 'booking_updates');
    });

    it('does nothing before the deadline, or when the payment was made', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(depositPlan({ payment_due_by: new Date(Date.now() + 3600_000), payment_due_kind: 'deposit' }));
      expect(await service.cancelForNonPayment('booking-1')).toBeNull();
      mockPrisma.booking.findFirst.mockResolvedValue(depositPlan({ payment_due_by: null }));
      expect(await service.cancelForNonPayment('booking-1')).toBeNull();
      expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
    });

    it('a vendor’s own cancellation offers the customer similar vendors free on their date', async () => {
      const event = new Date(Date.now() + 40 * DAY);
      mockPrisma.booking.findFirst.mockResolvedValue(depositPlan({ event_start_at: event }));
      mockMarketplace.similarAvailable.mockResolvedValue([
        { id: 'l2', title: 'Full day coverage', price: 900, image: null, vendor_id: 'v2', vendor_name: 'Lens Co', avg_rating: 4.8 },
        { id: 'l3', title: 'Half day', price: 500, image: null, vendor_id: 'v3', vendor_name: null, avg_rating: null },
      ]);

      const result = await service.cancel('booking-1', 'vendor-1', { reason_code: 'double_booked' });

      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(event);
      expect(mockMarketplace.similarAvailable).toHaveBeenCalledWith({ categoryId: 'cat-photo', date: day, excludeVendorId: 'vendor-1', take: 4 });
      const toCustomer = mockMail.sendBookingNotification.mock.calls.find((c: any) => c[0].to === 'customer@test.com')[0];
      expect(toCustomer.lines).toEqual(expect.arrayContaining([{ label: 'Free on your date', value: 'Lens Co: Full day coverage, $900.00' }]));
      expect(toCustomer.ctaUrl).toContain(`/marketplace?category_id=cat-photo&date=${day}`);
      expect(toCustomer.reason).toBe('Double booked');
      expect((result.data as any).similar_vendors.items).toHaveLength(2);
      expect(mockPush.sendToUser).toHaveBeenCalledWith('customer-1', expect.objectContaining({ body: expect.stringContaining('Similar vendors are free on your date') }), 'booking_updates');
    });

    it('the second own cancellation in 90 days tells Vendly’s admins once', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPrisma.booking.groupBy.mockResolvedValue([{ vendor_id: 'vendor-1', _count: { _all: 2 } }]);
      mockPrisma.user.findUnique.mockResolvedValue({ name: 'Vendor', email: 'vendor@test.com', vendorProfile: { business_name: 'Glam Co' } });

      await service.cancel('booking-1', 'vendor-1', { reason_code: 'emergency' });

      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({ where: { id: 'vendor-1', is_test: false, OR: [{ cancellations_alerted_at: null }, { cancellations_alerted_at: { lt: expect.any(Date) } }] }, data: { cancellations_alerted_at: expect.any(Date) } });
      expect(mockPush.sendToUser).toHaveBeenCalledWith('admin-1', expect.objectContaining({ title: 'Vendor cancelling bookings', body: expect.stringContaining('Glam Co has cancelled 2 bookings in the last 90 days') }));
      expect(mockMail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@vendly.test' }));

      // already told: nothing more
      jest.clearAllMocks();
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.updateMany.mockResolvedValueOnce({ count: 0 });
      await service.cancel('booking-1', 'vendor-1', { reason_code: 'emergency' });
      expect(mockPush.sendToUser).not.toHaveBeenCalledWith('admin-1', expect.anything());
    });

    it('a safety concern is not counted', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      await service.cancel('booking-1', 'vendor-1', { reason_code: 'safety_concern' });
      expect(mockPrisma.booking.groupBy).not.toHaveBeenCalled();
    });

    it('lists show "Pending deposit" while a missed deposit waits, and the reason once cancelled', async () => {
      const due = new Date(Date.now() + 3600_000);
      mockPrisma.booking.findFirst.mockResolvedValue(depositPlan({ payment_due_by: due, payment_due_kind: 'deposit' }));
      const pending = (await service.getBooking('booking-1', 'vendor-1')).data;
      expect(pending).toMatchObject({ status: 'CONFIRMED', payment_state: 'pending_deposit', payment_state_label: 'Pending deposit', payment_due_by: due });
      mockPrisma.booking.findFirst.mockResolvedValue(depositPlan({ status: BookingStatus.CANCELLED, cancelled_by: 'VENDOR', cancel_reason_code: 'double_booked', payment_due_by: null }));
      const cancelled = (await service.getBooking('booking-1', 'customer-1')).data;
      expect(cancelled).toMatchObject({ payment_state: null, cancel_reason_label: 'Double booked', similar_vendors: expect.objectContaining({ items: [] }) });
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
