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
      expect(mockContracts.createSignedBooking).toHaveBeenCalledWith('customer-1', signedRequest, { ip: '1.2.3.4' });
      expect(mockPush.sendToUser).toHaveBeenCalledWith('vendor-1', expect.objectContaining({ data: { type: 'booking', bookingId: 'booking-1' } }));
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
      );
    });

    it('pushes the other party on cancellation', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });

      await service.cancel('booking-1', 'customer-1', {} as any);

      expect(mockPush.sendToUser).toHaveBeenCalledWith('vendor-1', expect.anything());
    });
  });

  describe('proofs', () => {
    const photo = { originalname: 'a.jpg', buffer: Buffer.from('x') } as Express.Multer.File;

    it('lets a booking participant upload proof photos', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPrisma.bookingProof.create.mockImplementation(({ data }) => Promise.resolve({ id: 'p1', ...data }));

      const res = await service.uploadProof('booking-1', 'vendor-1', [photo], 'done');

      expect(TanvirStorage.put).toHaveBeenCalledTimes(1);
      expect(res.data.photos[0]).toMatch(/^https:\/\/cdn\.test\/proofs\//);
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

    it('pushes the customer when a deliverable is sent', async () => {
      await service.sendDeliverable('booking-1', 'vendor-1', [], { title: 'Final files' });
      expect(mockPush.sendToUser).toHaveBeenCalledWith(
        'customer-1',
        expect.objectContaining({ title: 'New deliverable', body: 'Final files' }),
      );
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
      const completedAt = new Date();
      mockPrisma.booking.update.mockResolvedValue({ ...mockBooking, status: BookingStatus.COMPLETED, completed_at: completedAt });

      await service.complete('booking-1', 'vendor-1');

      expect(mockPayments.onBookingCompleted).toHaveBeenCalledWith('booking-1', completedAt);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('does not credit unpaid or already-credited bookings', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.IN_PROGRESS });
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

  it('lets customers pay a completed booking that is still unpaid', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, status: BookingStatus.COMPLETED, paid_at: null, service_fee: 5 });
    const res = await service.createCheckoutSession('booking-1', 'customer-1');
    expect(res.data.checkout_url).toBe('https://checkout.test/cs_1');
  });
});
