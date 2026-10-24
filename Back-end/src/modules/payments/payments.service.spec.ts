import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BookingStatus, InstallmentStatus, PaymentPlan } from 'prisma/generated/enums';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';
import { MailService } from 'src/mail/mail.service';
import { PushService } from 'src/modules/push/push.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaymentsService } from './payments.service';
import { __setFeeCache } from 'src/modules/platform/platform-settings.service';

jest.mock('src/common/lib/Payment/stripe/StripePayment', () => ({
  StripePayment: {
    createCustomer: jest.fn(),
    createSetupIntent: jest.fn(),
    listCards: jest.fn(),
    getCustomerByID: jest.fn(),
    retrievePaymentMethod: jest.fn(),
    detachPaymentMethod: jest.fn(),
    setCustomerDefaultPaymentMethodId: jest.fn(),
    chargeSavedCard: jest.fn(),
    capturePaymentIntent: jest.fn(),
    cancelPaymentIntent: jest.fn(),
    transferForBooking: jest.fn(),
    refundPaymentIntent: jest.fn(),
  },
}));
jest.mock('src/config/app.config', () => ({ __esModule: true, default: () => ({ app: { client_app_url: 'https://app.test' } }) }));

const DAY = 24 * 3600 * 1000;

const prisma = {
  user: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([{ id: 'admin1' }]) },
  booking: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn(), findMany: jest.fn() },
  bookingInstallment: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  bookingProof: { findFirst: jest.fn() },
  paymentTransaction: { create: jest.fn(), findMany: jest.fn(), count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
  vendorListing: { findUnique: jest.fn() },
  rentalReservation: { count: jest.fn().mockResolvedValue(0) },
  bookingExtra: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), findFirst: jest.fn().mockResolvedValue(null) },
  $transaction: jest.fn(),
  $queryRaw: jest.fn().mockResolvedValue([]),
};
const mail = { sendBookingNotification: jest.fn().mockResolvedValue(undefined) };
const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };

const bookingRef = {
  id: 'b1',
  customer_id: 'c1',
  payment_method_id: 'pm_1',
  status: BookingStatus.CONFIRMED,
  listing: { title: 'Bridal Glam' },
  customer: { email: 'amara@x.com', name: 'Amara', billing_id: 'cus_1' },
};
const installment = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  booking_id: 'b1',
  sequence: 1,
  label: '50% deposit',
  amount: 247.5,
  fee_amount: 22.5,
  currency: 'usd',
  due_at: new Date(),
  status: InstallmentStatus.SCHEDULED,
  capture_manually: false,
  payment_intent_id: null,
  attempts: 0,
  next_attempt_at: null,
  last_error: null,
  paid_at: null,
  refunded_amount: 0,
  booking: bookingRef,
  ...over,
});

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((fn: any) => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn)));
    prisma.bookingInstallment.updateMany.mockResolvedValue({ count: 1 });
    prisma.bookingInstallment.update.mockImplementation(({ data }: any) => Promise.resolve({ ...installment(), ...data }));
    prisma.bookingInstallment.findUniqueOrThrow.mockImplementation(({ where }: any) => Promise.resolve(installment({ id: where.id, status: InstallmentStatus.PAID, payment_intent_id: 'pi_1' })));
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.findUnique.mockResolvedValue({ customer_id: 'c1' });
    const module = await Test.createTestingModule({
      providers: [PaymentsService, { provide: PrismaService, useValue: prisma }, { provide: MailService, useValue: mail }, { provide: PushService, useValue: push }],
    }).compile();
    service = module.get(PaymentsService);
  });

  describe('chargeInstallment', () => {
    it('charges the saved card off-session and marks the installment paid', async () => {
      prisma.bookingInstallment.findUnique.mockResolvedValue(installment());
      (StripePayment.chargeSavedCard as jest.Mock).mockResolvedValue({ id: 'pi_1', status: 'succeeded' });

      await service.chargeInstallment('i1');

      expect(StripePayment.chargeSavedCard).toHaveBeenCalledWith(expect.objectContaining({ amount: 247.5, customerId: 'cus_1', paymentMethodId: 'pm_1', captureManually: false, idempotencyKey: 'inst-i1-1-0' }));
      // guarded: only a call that actually moves it to PAID counts
      expect(prisma.bookingInstallment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'i1', status: { not: InstallmentStatus.PAID } }, data: expect.objectContaining({ status: InstallmentStatus.PAID, payment_intent_id: 'pi_1' }) }));
      expect(prisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: 'b1', paid_at: null }, data: { paid_at: expect.any(Date) } });
      expect(prisma.paymentTransaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'booking_installment', status: 'succeeded', amount: 247.5 }) }));
    });

    it('keeps a declined installment scheduled for a retry in 24 hours and tells the customer', async () => {
      prisma.bookingInstallment.findUnique.mockResolvedValue(installment());
      (StripePayment.chargeSavedCard as jest.Mock).mockRejectedValue({ code: 'card_declined', raw: { message: 'Your card was declined.' } });

      const before = Date.now();
      await service.chargeInstallment('i1');

      const data = prisma.bookingInstallment.update.mock.calls[0][0].data;
      expect(data.status).toBe(InstallmentStatus.SCHEDULED);
      expect(data.attempts).toBe(1);
      expect(data.next_attempt_at.getTime()).toBeGreaterThanOrEqual(before + DAY - 1000);
      expect(mail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ to: 'amara@x.com', status: 'PAYMENT_FAILED' }));
      expect(push.sendToUser).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'Payment problem' }), 'payments');
    });

    it('gives up after the third attempt', async () => {
      prisma.bookingInstallment.findUnique.mockResolvedValue(installment({ attempts: 2 }));
      (StripePayment.chargeSavedCard as jest.Mock).mockRejectedValue({ code: 'card_declined', raw: { message: 'Declined' } });

      await service.chargeInstallment('i1');

      expect(StripePayment.chargeSavedCard).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'inst-i1-3-0' }));
      expect(prisma.bookingInstallment.update.mock.calls[0][0].data).toMatchObject({ status: InstallmentStatus.FAILED, attempts: 3, next_attempt_at: null });
    });

    it('fails straight away when the bank wants the customer present', async () => {
      prisma.bookingInstallment.findUnique.mockResolvedValue(installment());
      (StripePayment.chargeSavedCard as jest.Mock).mockRejectedValue({ code: 'authentication_required', raw: { message: 'Authentication required', payment_intent: { id: 'pi_x' } } });

      await service.chargeInstallment('i1');

      expect(prisma.bookingInstallment.update.mock.calls[0][0].data).toMatchObject({ status: InstallmentStatus.FAILED, payment_intent_id: 'pi_x' });
    });

    it('holds (does not capture) a pay-after-service charge', async () => {
      prisma.bookingInstallment.findUnique.mockResolvedValue(installment({ capture_manually: true }));
      (StripePayment.chargeSavedCard as jest.Mock).mockResolvedValue({ id: 'pi_h', status: 'requires_capture' });

      await service.chargeInstallment('i1');

      expect(StripePayment.chargeSavedCard).toHaveBeenCalledWith(expect.objectContaining({ captureManually: true }));
      expect(prisma.bookingInstallment.update.mock.calls[0][0].data).toMatchObject({ status: InstallmentStatus.PROCESSING, payment_intent_id: 'pi_h' });
      expect(prisma.booking.updateMany).not.toHaveBeenCalled();
    });

    it('cancels instead of charging when the booking was cancelled', async () => {
      prisma.bookingInstallment.findUnique.mockResolvedValue(installment({ booking: { ...bookingRef, status: BookingStatus.CANCELLED } }));
      await service.chargeInstallment('i1');
      expect(StripePayment.chargeSavedCard).not.toHaveBeenCalled();
      expect(prisma.bookingInstallment.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { status: InstallmentStatus.CANCELLED } });
    });

    it('does not double charge when another worker already claimed the attempt', async () => {
      prisma.bookingInstallment.findUnique.mockResolvedValue(installment());
      prisma.bookingInstallment.updateMany.mockResolvedValue({ count: 0 });
      await service.chargeInstallment('i1');
      expect(StripePayment.chargeSavedCard).not.toHaveBeenCalled();
    });
  });

  describe('scheduleForBooking', () => {
    it('snapshots the plan into installments and charges the deposit immediately', async () => {
      prisma.booking.findUnique.mockResolvedValueOnce({ id: 'b1', amount: 450, service_fee: 22.5, currency: 'usd', event_start_at: new Date(Date.now() + 30 * DAY), scheduled_at: null, payment_plan: null, listing_id: 'l1', paid_at: null, installments: [] });
      prisma.vendorListing.findUnique.mockResolvedValue({ payment_plan: PaymentPlan.DEPOSIT_50, category: null });
      let seq = 0;
      prisma.bookingInstallment.create.mockImplementation(({ data }: any) => Promise.resolve({ id: `i${++seq}`, ...data }));
      const charge = jest.spyOn(service, 'chargeInstallment').mockResolvedValue(null);

      const rows = await service.scheduleForBooking('b1');

      expect(prisma.booking.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { payment_plan: PaymentPlan.DEPOSIT_50 } });
      expect(rows).toHaveLength(2);
      expect(charge).toHaveBeenCalledTimes(1);
      expect(charge).toHaveBeenCalledWith('i1');
    });

    it('is a no-op for a booking that already has installments', async () => {
      prisma.booking.findUnique.mockResolvedValueOnce({ id: 'b1', installments: [{ id: 'x' }], paid_at: null });
      expect(await service.scheduleForBooking('b1')).toEqual([]);
      expect(prisma.bookingInstallment.create).not.toHaveBeenCalled();
    });
  });

  describe('rental security deposit', () => {
    it('adds a refundable hold the day before pickup when the booking has a security deposit', async () => {
      const start = new Date(Date.now() + 10 * DAY);
      prisma.booking.findUnique.mockResolvedValueOnce({ id: 'b1', amount: 300, service_fee: 15, security_deposit: 80, currency: 'usd', event_start_at: start, scheduled_at: start, payment_plan: PaymentPlan.FULL_ON_ACCEPT, listing_id: null, paid_at: null, installments: [] });
      let seq = 0;
      prisma.bookingInstallment.create.mockImplementation(({ data }: any) => Promise.resolve({ id: `i${++seq}`, ...data }));
      const charge = jest.spyOn(service, 'chargeInstallment').mockResolvedValue(null);

      const rows = await service.scheduleForBooking('b1');

      expect(rows).toHaveLength(2);
      const hold = rows[1] as any;
      expect(hold).toMatchObject({ kind: 'security_deposit', amount: 80, fee_amount: 0, capture_manually: true });
      expect(hold.due_at.getTime()).toBe(start.getTime() - DAY);
      expect(charge).toHaveBeenCalledTimes(1); // only the rental price now; the hold waits until the day before
    });

    it('does not capture the deposit hold when the booking is completed', async () => {
      prisma.bookingInstallment.findMany.mockResolvedValue([]);
      prisma.bookingProof.findFirst.mockResolvedValue(null);
      await service.onBookingCompleted('b1');
      expect(prisma.bookingInstallment.findMany).toHaveBeenCalledWith({ where: expect.objectContaining({ kind: { not: 'security_deposit' } }) });
    });

    it('voids the hold when the items come back with no fees', async () => {
      prisma.bookingInstallment.findFirst.mockResolvedValueOnce(installment({ kind: 'security_deposit', amount: 80, capture_manually: true, status: InstallmentStatus.PROCESSING, payment_intent_id: 'pi_hold' }));
      (StripePayment.cancelPaymentIntent as jest.Mock).mockResolvedValue({ id: 'pi_hold' });
      const out = await service.settleSecurityDeposit('b1', 0);
      expect(StripePayment.cancelPaymentIntent).toHaveBeenCalledWith('pi_hold');
      expect(StripePayment.capturePaymentIntent).not.toHaveBeenCalled();
      expect(out).toMatchObject({ captured_from_deposit: 0, charged_extra: 0, deposit_released: true });
    });

    it('captures part of the hold for fees and releases the rest', async () => {
      prisma.bookingInstallment.findFirst.mockResolvedValueOnce(installment({ kind: 'security_deposit', amount: 80, capture_manually: true, status: InstallmentStatus.PROCESSING, payment_intent_id: 'pi_hold' }));
      const out = await service.settleSecurityDeposit('b1', 30);
      expect(StripePayment.capturePaymentIntent).toHaveBeenCalledWith('pi_hold', 'deposit-i1', 30);
      expect(prisma.bookingInstallment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 30 }) }));
      expect(out).toMatchObject({ captured_from_deposit: 30, charged_extra: 0 });
    });

    it('charges fees above the hold as an extra', async () => {
      prisma.bookingInstallment.findFirst
        .mockResolvedValueOnce(installment({ kind: 'security_deposit', amount: 80, capture_manually: true, status: InstallmentStatus.PROCESSING, payment_intent_id: 'pi_hold' }))
        .mockResolvedValueOnce({ sequence: 2, currency: 'usd' });
      prisma.bookingInstallment.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'x1', ...data }));
      const charge = jest.spyOn(service, 'chargeInstallment').mockResolvedValue(null);
      const out = await service.settleSecurityDeposit('b1', 120);
      expect(StripePayment.capturePaymentIntent).toHaveBeenCalledWith('pi_hold', 'deposit-i1', 80);
      expect(prisma.bookingInstallment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 40, kind: 'extra', sequence: 3 }) });
      expect(charge).toHaveBeenCalledWith('x1');
      expect(out).toMatchObject({ captured_from_deposit: 80, charged_extra: 40 });
    });

    it('holds the vendor payout until rented items are returned', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: 'b1', status: BookingStatus.COMPLETED, released_at: null, dispute_opened_at: null, installments: [] });
      prisma.rentalReservation.count.mockResolvedValueOnce(2);
      expect(await service.releaseBooking('b1')).toBeNull();
      expect(prisma.booking.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ released_at: expect.any(Date) }) }));
    });
  });

  describe('Phase C money tools', () => {
    afterEach(() => __setFeeCache(null));
    const completed = (over: Record<string, unknown> = {}) => ({
      id: 'b1', status: BookingStatus.COMPLETED, released_at: null, currency: 'usd', vendor_id: 'v1', amount: 100, payout_credited_at: null, dispute_opened_at: null, dispute_resolved_at: null, early_released_amount: 0,
      vendor: { stripe_connect_id: 'acct_1', balance: 0 },
      installments: [installment({ status: InstallmentStatus.PAID, amount: 105, fee_amount: 5 })],
      ...over,
    });

    it('takes the Vendly commission before paying the vendor', async () => {
      __setFeeCache({ percent: 5, minimum: 3, commission: 10, categories: new Map() });
      prisma.booking.findUnique.mockResolvedValue(completed());
      (StripePayment.transferForBooking as jest.Mock).mockResolvedValue({ id: 'tr_1' });
      await service.releaseBooking('b1');
      expect(prisma.booking.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ commission_amount: 10 }) }));
      expect(StripePayment.transferForBooking).toHaveBeenCalledWith(expect.objectContaining({ amount: 90 }));
    });

    it('subtracts an early-released deposit from the final payout', async () => {
      prisma.booking.findUnique.mockResolvedValue(completed({ early_released_amount: 40 }));
      (StripePayment.transferForBooking as jest.Mock).mockResolvedValue({ id: 'tr_1' });
      await service.releaseBooking('b1');
      expect(StripePayment.transferForBooking).toHaveBeenCalledWith(expect.objectContaining({ amount: 60 }));
    });

    it('recovers what the vendor owes from this payout first', async () => {
      prisma.booking.findUnique.mockResolvedValue(completed({ vendor: { stripe_connect_id: 'acct_1', balance: -30 } }));
      (StripePayment.transferForBooking as jest.Mock).mockResolvedValue({ id: 'tr_1' });
      await service.releaseBooking('b1');
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { balance: { increment: 30 } } });
      expect(StripePayment.transferForBooking).toHaveBeenCalledWith(expect.objectContaining({ amount: 70 }));
    });

    it('releases a paid deposit early and records it against the booking', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        vendor_id: 'v1', status: BookingStatus.CONFIRMED, currency: 'usd', early_released_amount: 0, dispute_opened_at: null, dispute_resolved_at: null,
        vendor: { stripe_connect_id: 'acct_1' }, contracts: [{ id: 'c1' }],
        installments: [installment({ status: InstallmentStatus.PAID, amount: 247.5, fee_amount: 22.5 }), installment({ id: 'i2', sequence: 2, status: InstallmentStatus.SCHEDULED })],
      });
      (StripePayment.transferForBooking as jest.Mock).mockResolvedValue({ id: 'tr_early' });
      const res = await service.releaseDepositEarly('b1', 'v1');
      expect(res.data.amount).toBe(225);
      expect(prisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: 'b1', early_released_amount: 0 }, data: { early_released_amount: 225 } });
      expect(StripePayment.transferForBooking).toHaveBeenCalledWith(expect.objectContaining({ amount: 225, idempotencyKey: 'early-b1' }));
    });

    it('will not release a deposit before the contract is signed', async () => {
      prisma.booking.findUnique.mockResolvedValue({ vendor_id: 'v1', status: BookingStatus.CONFIRMED, early_released_amount: 0, vendor: { stripe_connect_id: 'acct_1' }, contracts: [], installments: [] });
      await expect(service.releaseDepositEarly('b1', 'v1')).rejects.toThrow(BadRequestException);
    });

    it('resolves a dispute with a full refund and claws back an early release', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1', status: BookingStatus.COMPLETED, dispute_opened_at: new Date(), dispute_resolved_at: null, released_at: null, vendor_id: 'v1', currency: 'usd', early_released_amount: 50,
        listing: { title: 'Glam' }, customer: { email: 'c@x.com', name: 'C' }, vendor: { email: 'v@x.com', name: 'V' },
        installments: [installment({ status: InstallmentStatus.PAID, amount: 105, fee_amount: 5 })],
      });
      const refund = jest.spyOn(service, 'refundBooking').mockResolvedValue(105);
      const res = await service.resolveDispute('b1', 'admin', { action: 'refund', note: 'No-show confirmed' });
      expect(refund).toHaveBeenCalledWith('b1', 105, 'dispute-b1');
      expect(res.data.refunded).toBe(105);
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { balance: { increment: -50 } } });
      expect(mail.sendBookingNotification).toHaveBeenCalledTimes(2);
    });

    it('rejects a partial refund that is the whole amount', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: 'b1', status: BookingStatus.COMPLETED, dispute_opened_at: new Date(), dispute_resolved_at: null, released_at: null, installments: [installment({ status: InstallmentStatus.PAID, amount: 105 })] });
      await expect(service.resolveDispute('b1', 'admin', { action: 'partial_refund', amount: 105, note: 'split' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('release', () => {
    it('transfers the vendor share (paid minus fee minus refunds) to their Connect account', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1', status: BookingStatus.COMPLETED, released_at: null, currency: 'usd', vendor_id: 'v1', amount: 450, payout_credited_at: null, dispute_opened_at: null, dispute_resolved_at: null,
        vendor: { stripe_connect_id: 'acct_1' },
        installments: [installment({ status: InstallmentStatus.PAID, amount: 247.5, fee_amount: 22.5 }), installment({ id: 'i2', status: InstallmentStatus.PAID, amount: 225, fee_amount: 0, refunded_amount: 25 })],
      });
      (StripePayment.transferForBooking as jest.Mock).mockResolvedValue({ id: 'tr_1' });

      await service.releaseBooking('b1');

      expect(StripePayment.transferForBooking).toHaveBeenCalledWith(expect.objectContaining({ amount: 425, accountId: 'acct_1', idempotencyKey: 'release-b1' }));
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('credits the Vendly balance when the vendor has no Connect account', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: 'b1', status: BookingStatus.COMPLETED, released_at: null, currency: 'usd', vendor_id: 'v1', amount: 100, payout_credited_at: null, dispute_opened_at: null, dispute_resolved_at: null, vendor: { stripe_connect_id: null }, installments: [installment({ status: InstallmentStatus.PAID, amount: 105, fee_amount: 5 })] });
      await service.releaseBooking('b1');
      expect(StripePayment.transferForBooking).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { balance: { increment: 100 } } });
    });

    it('holds the money while a dispute is open', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: 'b1', status: BookingStatus.COMPLETED, released_at: null, vendor_id: 'v1', dispute_opened_at: new Date(), dispute_resolved_at: null, vendor: { stripe_connect_id: 'acct_1' }, installments: [] });
      expect(await service.releaseBooking('b1')).toBeNull();
      expect(prisma.booking.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ released_at: expect.any(Date) }) }));
    });

    it('sets the release clock to 48h after proof when that is sooner than the 3-day auto-approve', async () => {
      prisma.bookingInstallment.findMany.mockResolvedValue([]);
      const completedAt = new Date('2026-10-14T12:00:00Z');
      prisma.bookingProof.findFirst.mockResolvedValue({ created_at: new Date('2026-10-14T10:00:00Z') });
      await service.onBookingCompleted('b1', completedAt);
      expect(prisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: 'b1', released_at: null }, data: { release_at: new Date('2026-10-16T10:00:00Z') } });
    });

    it('refuses approval while a dispute is open', async () => {
      prisma.booking.findUnique.mockResolvedValue({ customer_id: 'c1', status: BookingStatus.COMPLETED, released_at: null, dispute_opened_at: new Date(), dispute_resolved_at: null });
      await expect(service.approveBooking('b1', 'c1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('refundBooking', () => {
    it('refunds newest installment first and voids uncaptured holds', async () => {
      prisma.bookingInstallment.findMany.mockResolvedValue([
        installment({ id: 'i2', sequence: 2, status: InstallmentStatus.PAID, amount: 225, fee_amount: 0, payment_intent_id: 'pi_2' }),
        installment({ id: 'i1', sequence: 1, status: InstallmentStatus.PAID, amount: 247.5, fee_amount: 22.5, payment_intent_id: 'pi_1' }),
      ]);
      (StripePayment.refundPaymentIntent as jest.Mock).mockImplementation((_pi: string, key: string) => Promise.resolve({ id: `re_${key}` }));

      const refunded = await service.refundBooking('b1', 300, 'cancel-b1');

      expect(refunded).toBe(300);
      expect(StripePayment.refundPaymentIntent).toHaveBeenNthCalledWith(1, 'pi_2', 'cancel-b1-i2', 225);
      expect(StripePayment.refundPaymentIntent).toHaveBeenNthCalledWith(2, 'pi_1', 'cancel-b1-i1', 75);
    });

    it('voids a pay-after hold rather than refunding it', async () => {
      prisma.bookingInstallment.findMany.mockResolvedValue([installment({ capture_manually: true, status: InstallmentStatus.PROCESSING, payment_intent_id: 'pi_h' })]);
      (StripePayment.cancelPaymentIntent as jest.Mock).mockResolvedValue({ id: 'pi_h', status: 'canceled' });
      expect(await service.refundBooking('b1', 100, 'cancel-b1')).toBe(0);
      expect(StripePayment.cancelPaymentIntent).toHaveBeenCalledWith('pi_h');
      expect(StripePayment.refundPaymentIntent).not.toHaveBeenCalled();
    });
  });

  describe('release maths', () => {
    it('never lets an installment refunded past the vendor part count as minus', async () => {
      // i1 was refunded in full (fee included); i2 is a $100 add-on paid later
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1', status: BookingStatus.COMPLETED, released_at: null, currency: 'usd', vendor_id: 'v1', amount: 200, payout_credited_at: null, dispute_opened_at: null, dispute_resolved_at: null, early_released_amount: 0,
        vendor: { stripe_connect_id: 'acct_1', balance: 0 },
        installments: [
          installment({ id: 'i1', status: InstallmentStatus.REFUNDED, amount: 105, fee_amount: 5, refunded_amount: 105 }),
          installment({ id: 'i2', status: InstallmentStatus.PAID, amount: 105, fee_amount: 5, refunded_amount: 0 }),
        ],
      });
      (StripePayment.transferForBooking as jest.Mock).mockResolvedValue({ id: 'tr_1' });
      await service.releaseBooking('b1');
      expect(StripePayment.transferForBooking).toHaveBeenCalledWith(expect.objectContaining({ amount: 100 }));
    });

    it('marks what it paid out and records the gross for later refunds', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1', status: BookingStatus.COMPLETED, released_at: null, currency: 'usd', vendor_id: 'v1', amount: 100, payout_credited_at: null, dispute_opened_at: null, dispute_resolved_at: null, early_released_amount: 0,
        vendor: { stripe_connect_id: null, balance: 0 },
        installments: [installment({ status: InstallmentStatus.PAID, amount: 105, fee_amount: 5 })],
      });
      await service.releaseBooking('b1');
      expect(prisma.booking.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ released_gross: 100 }) }));
      expect(prisma.bookingInstallment.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['i1'] }, paid_out_at: null }, data: { paid_out_at: expect.any(Date) } });
    });

    it('takes the money lock so payouts, refunds and captures never overlap, and lets it go', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
      await service.releaseBooking('b1');
      expect(prisma.booking.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: expect.objectContaining({ id: 'b1' }), data: expect.objectContaining({ money_lock_token: expect.any(String) }) }));
      // the lock is let go (the final-invoice claim that follows runs outside it)
      expect(prisma.booking.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { money_lock_until: null, money_lock_token: null } }));
    });
  });

  describe('captures and charges', () => {
    it('captures the installment amount (lower than the hold when the vendor gave money off)', async () => {
      prisma.bookingInstallment.findMany.mockResolvedValue([installment({ capture_manually: true, status: InstallmentStatus.PROCESSING, payment_intent_id: 'pi_h', amount: 180 })]);
      prisma.bookingProof.findFirst.mockResolvedValue(null);
      (StripePayment.capturePaymentIntent as jest.Mock).mockResolvedValue({ id: 'pi_h' });
      await service.onBookingCompleted('b1');
      expect(StripePayment.capturePaymentIntent).toHaveBeenCalledWith('pi_h', 'capture-i1', 180);
    });

    it('only claims a charge at the amount it read, so a lowered balance is never charged at the old price', async () => {
      prisma.bookingInstallment.findUnique.mockResolvedValue(installment());
      prisma.bookingInstallment.updateMany.mockResolvedValueOnce({ count: 0 });
      await service.chargeInstallment('i1');
      expect(prisma.bookingInstallment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ amount: 247.5 }) }));
      expect(StripePayment.chargeSavedCard).not.toHaveBeenCalled();
    });

    it('releases holds and calls off unpaid charges on a cancelled booking', async () => {
      prisma.bookingInstallment.findMany.mockResolvedValue([
        installment({ id: 'h', capture_manually: true, status: InstallmentStatus.PROCESSING, payment_intent_id: 'pi_h' }),
        installment({ id: 's', status: InstallmentStatus.SCHEDULED }),
        installment({ id: 'p', status: InstallmentStatus.PROCESSING, payment_intent_id: 'pi_live', capture_manually: false }),
      ]);
      (StripePayment.cancelPaymentIntent as jest.Mock).mockResolvedValue({});
      await service.voidOpenCharges('b1');
      expect(StripePayment.cancelPaymentIntent).toHaveBeenCalledTimes(1);
      expect(StripePayment.cancelPaymentIntent).toHaveBeenCalledWith('pi_h');
      const cancelled = prisma.bookingInstallment.updateMany.mock.calls.map((c: any) => c[0].where.id);
      expect(cancelled).toEqual(['h', 's']);
    });
  });

  describe('refunds that keep the Vendly Protection fee', () => {
    it('refunds only the vendor part of each installment', async () => {
      prisma.bookingInstallment.findMany.mockResolvedValue([installment({ status: InstallmentStatus.PAID, amount: 247.5, fee_amount: 22.5, payment_intent_id: 'pi_1' })]);
      (StripePayment.refundPaymentIntent as jest.Mock).mockResolvedValue({ id: 're_1' });
      expect(await service.refundBooking('b1', 500, 'k', { keepFees: true })).toBe(225);
      expect(StripePayment.refundPaymentIntent).toHaveBeenCalledWith('pi_1', 'k-i1', 225);
      // the installment keeps its fee, so it stays PAID rather than REFUNDED
      expect(prisma.bookingInstallment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InstallmentStatus.PAID }) }));
    });
  });

  describe('vendor gives money back', () => {
    const booking = (over: Record<string, unknown> = {}) => ({
      id: 'b1', vendor_id: 'v1', customer_id: 'c1', status: BookingStatus.CONFIRMED, currency: 'usd', released_at: null, commission_amount: null, released_gross: null, dispute_opened_at: null, dispute_resolved_at: null,
      installments: [
        installment({ id: 'i1', sequence: 1, status: InstallmentStatus.PAID, amount: 300, fee_amount: 50, payment_intent_id: 'pi_1' }),
        installment({ id: 'i2', sequence: 2, status: InstallmentStatus.SCHEDULED, amount: 750, fee_amount: 0 }),
      ],
      ...over,
    });
    beforeEach(() => {
      (StripePayment.refundPaymentIntent as jest.Mock).mockResolvedValue({ id: 're_1' });
      prisma.booking.findUnique.mockReset();
    });

    it('takes it off what the customer still owes first', async () => {
      prisma.booking.findUnique.mockResolvedValueOnce(booking()).mockResolvedValueOnce({ listing: { title: 'Catering' }, customer: { email: 'c@x.com', name: 'C' }, vendor: { name: 'V' } });
      const res = await service.giveBack('b1', 'v1', { amount: 100, reason: 'Started late' });
      expect(res.data).toMatchObject({ amount: 100, lowered: 100, refunded: 0 });
      expect(prisma.bookingInstallment.updateMany).toHaveBeenCalledWith({ where: { id: 'i2', status: InstallmentStatus.SCHEDULED, amount: 750 }, data: { amount: 650 } });
      expect(StripePayment.refundPaymentIntent).not.toHaveBeenCalled();
      expect(push.sendToUser).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'Money back from your vendor' }), 'payments');
    });

    it('refunds the vendor part of what was paid when nothing is left to pay, keeping the fee', async () => {
      prisma.booking.findUnique.mockResolvedValueOnce(booking({ status: BookingStatus.COMPLETED, installments: [installment({ id: 'i1', status: InstallmentStatus.PAID, amount: 1050, fee_amount: 50, payment_intent_id: 'pi_1' })] })).mockResolvedValueOnce(null);
      prisma.bookingInstallment.findMany.mockResolvedValue([installment({ id: 'i1', status: InstallmentStatus.PAID, amount: 1050, fee_amount: 50, payment_intent_id: 'pi_1' })]);
      const res = await service.giveBack('b1', 'v1', { amount: 200, reason: 'Fewer guests came' });
      expect(res.data).toMatchObject({ refunded: 200, lowered: 0, recovered_from_balance: 0 });
      expect(StripePayment.refundPaymentIntent).toHaveBeenCalledWith('pi_1', 'giveback-i1-0', 200);
    });

    it('after the payout, takes it back from the vendor balance less the commission Vendly took', async () => {
      const paidOut = installment({ id: 'i1', status: InstallmentStatus.PAID, amount: 1050, fee_amount: 50, payment_intent_id: 'pi_1', paid_out_at: new Date() });
      prisma.booking.findUnique.mockResolvedValueOnce(booking({ status: BookingStatus.COMPLETED, released_at: new Date(), commission_amount: 100, released_gross: 1000, installments: [paidOut] })).mockResolvedValueOnce(null);
      prisma.bookingInstallment.findMany.mockResolvedValue([paidOut]);
      const res = await service.giveBack('b1', 'v1', { amount: 200, reason: 'Sorry' });
      expect(res.data.recovered_from_balance).toBe(180);
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { balance: { increment: -180 } } });
      expect(prisma.paymentTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'vendly_commission', amount: -20 }) });
    });

    it('cancels a balance given back in full, and never leaves less than Stripe can charge', async () => {
      prisma.booking.findUnique.mockResolvedValueOnce(booking()).mockResolvedValueOnce(null);
      await service.giveBack('b1', 'v1', { amount: 750, reason: 'On the house' });
      expect(prisma.bookingInstallment.updateMany).toHaveBeenCalledWith({ where: { id: 'i2', status: InstallmentStatus.SCHEDULED, amount: 750 }, data: { amount: 0, status: InstallmentStatus.CANCELLED } });

      prisma.bookingInstallment.updateMany.mockClear();
      prisma.booking.findUnique.mockResolvedValueOnce(booking()).mockResolvedValueOnce(null);
      prisma.bookingInstallment.findMany.mockResolvedValue([installment({ id: 'i1', status: InstallmentStatus.PAID, amount: 300, fee_amount: 50, payment_intent_id: 'pi_1' })]);
      const res = await service.giveBack('b1', 'v1', { amount: 749.8, reason: 'Nearly all' });
      // $0.20 would be left: it stops at $0.50 and refunds the other $0.30 instead
      expect(prisma.bookingInstallment.updateMany).toHaveBeenCalledWith({ where: { id: 'i2', status: InstallmentStatus.SCHEDULED, amount: 750 }, data: { amount: 0.5 } });
      expect(res.data).toMatchObject({ lowered: 749.5, refunded: 0.3 });
    });

    it('lets go of a pay-after-service hold given back in full', async () => {
      const hold = installment({ id: 'h', sequence: 1, status: InstallmentStatus.PROCESSING, capture_manually: true, amount: 500, fee_amount: 0, payment_intent_id: 'pi_h' });
      prisma.booking.findUnique.mockResolvedValueOnce(booking({ installments: [hold] })).mockResolvedValueOnce(null);
      await service.giveBack('b1', 'v1', { amount: 500, reason: 'Cancelled the extras' });
      expect(StripePayment.cancelPaymentIntent).toHaveBeenCalledWith('pi_h');
    });

    it('never gives back more than the vendor part', async () => {
      prisma.booking.findUnique.mockResolvedValueOnce(booking());
      await expect(service.giveBack('b1', 'v1', { amount: 1001, reason: 'x' })).rejects.toThrow('up to $1000.00');
    });

    it('is only for the booking vendor, and not during a dispute', async () => {
      prisma.booking.findUnique.mockResolvedValueOnce(booking());
      await expect(service.giveBack('b1', 'someone', { amount: 10, reason: 'x' })).rejects.toThrow('Access denied');
      prisma.booking.findUnique.mockResolvedValueOnce(booking({ dispute_opened_at: new Date() }));
      await expect(service.giveBack('b1', 'v1', { amount: 10, reason: 'x' })).rejects.toThrow('open dispute');
    });
  });

  describe('a charge that lands after the booking ended', () => {
    it('is refunded straight away on a cancelled booking', async () => {
      prisma.bookingInstallment.findUnique
        .mockResolvedValueOnce(installment({ status: InstallmentStatus.PROCESSING }))
        .mockResolvedValueOnce(installment({ status: InstallmentStatus.PAID, payment_intent_id: 'pi_late', amount: 100, booking: { status: BookingStatus.CANCELLED, dispute_resolution: null } }));
      (StripePayment.refundPaymentIntent as jest.Mock).mockResolvedValue({ id: 're_late' });
      await service.reconcilePaymentIntent({ id: 'pi_late', status: 'succeeded', metadata: { installment_id: 'i1' } });
      expect(StripePayment.refundPaymentIntent).toHaveBeenCalledWith('pi_late', 'ended-i1', 100);
      expect(prisma.bookingInstallment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'i1', status: InstallmentStatus.PAID }), data: expect.objectContaining({ status: InstallmentStatus.REFUNDED }) }));
    });

    it('is kept on a booking that is still going', async () => {
      prisma.bookingInstallment.findUnique
        .mockResolvedValueOnce(installment({ status: InstallmentStatus.PROCESSING }))
        .mockResolvedValueOnce(installment({ status: InstallmentStatus.PAID, payment_intent_id: 'pi_ok', booking: { status: BookingStatus.CONFIRMED, dispute_resolution: null } }));
      await service.reconcilePaymentIntent({ id: 'pi_ok', status: 'succeeded', metadata: { installment_id: 'i1' } });
      expect(StripePayment.refundPaymentIntent).not.toHaveBeenCalled();
    });
  });

  describe('add-ons that add time', () => {
    const start = new Date('2026-12-01T18:00:00Z');
    const end = new Date('2026-12-01T22:00:00Z');
    const extraInstallment = () => installment({ id: 'ix', kind: 'extra', status: InstallmentStatus.PROCESSING, payment_intent_id: 'pi_x' });
    beforeEach(() => {
      prisma.bookingInstallment.findUniqueOrThrow.mockImplementation(() => Promise.resolve({ ...extraInstallment(), status: InstallmentStatus.PAID }));
      prisma.bookingExtra.findFirst.mockResolvedValue({ kind: 'ADD_ON', extends_minutes: 120, booking_id: 'b1' });
      prisma.booking.findUnique.mockResolvedValue({ customer_id: 'c1', status: BookingStatus.CONFIRMED, event_start_at: start, event_end_at: end });
    });

    it('moves the booking end when the add-on’s installment is paid', async () => {
      prisma.bookingInstallment.findUnique.mockResolvedValue(extraInstallment());
      await service.reconcilePaymentIntent({ id: 'pi_x', status: 'succeeded', metadata: { installment_id: 'ix' } });
      expect(prisma.bookingExtra.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { installment_id: 'ix' } }));
      expect(prisma.booking.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { event_end_at: new Date('2026-12-02T00:00:00Z') } });
    });

    it('a booking with only a start ends that long after it starts', async () => {
      prisma.booking.findUnique.mockResolvedValue({ customer_id: 'c1', status: BookingStatus.CONFIRMED, event_start_at: start, event_end_at: null });
      prisma.bookingInstallment.findUnique.mockResolvedValue(extraInstallment());
      await service.reconcilePaymentIntent({ id: 'pi_x', status: 'succeeded', metadata: { installment_id: 'ix' } });
      expect(prisma.booking.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { event_end_at: new Date('2026-12-01T20:00:00Z') } });
    });

    it('moves it once even when the charge call and the webhook both mark it paid', async () => {
      prisma.bookingInstallment.findUnique.mockResolvedValue(extraInstallment());
      // the charge call wins the PAID transition; the webhook racing it finds it already PAID
      prisma.bookingInstallment.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      await Promise.all([
        service.reconcilePaymentIntent({ id: 'pi_x', status: 'succeeded', metadata: { installment_id: 'ix' } }),
        service.reconcilePaymentIntent({ id: 'pi_x', status: 'succeeded', metadata: { installment_id: 'ix' } }),
      ]);
      const moves = prisma.booking.update.mock.calls.filter((c: any) => c[0].data?.event_end_at);
      expect(moves).toHaveLength(1);
      // and the payment is recorded once
      expect(prisma.paymentTransaction.create.mock.calls.filter((c: any) => c[0].data.type === 'booking_installment')).toHaveLength(1);
    });

    it('leaves the end alone while the add-on is only authorized, and for fees', async () => {
      prisma.bookingInstallment.findUnique.mockResolvedValue({ ...extraInstallment(), status: InstallmentStatus.SCHEDULED });
      await service.reconcilePaymentIntent({ id: 'pi_x', status: 'requires_capture', metadata: { installment_id: 'ix' } });
      prisma.bookingExtra.findFirst.mockResolvedValue({ kind: 'FEE', extends_minutes: null, booking_id: 'b1' });
      prisma.bookingInstallment.findUnique.mockResolvedValue(extraInstallment());
      await service.reconcilePaymentIntent({ id: 'pi_x', status: 'succeeded', metadata: { installment_id: 'ix' } });
      expect(prisma.booking.update.mock.calls.filter((c: any) => c[0].data?.event_end_at)).toHaveLength(0);
    });
  });

  describe('extras paid after the payout', () => {
    it('pays the vendor their share at the booking commission rate', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: 'b1', status: BookingStatus.COMPLETED, released_at: new Date(), vendor_id: 'v1', currency: 'usd', commission_amount: 50, released_gross: 500, dispute_opened_at: null, dispute_resolved_at: null, vendor: { stripe_connect_id: 'acct_1', balance: 0 } });
      prisma.bookingInstallment.findMany.mockResolvedValue([installment({ id: 'x1', kind: 'extra', status: InstallmentStatus.PAID, amount: 105, fee_amount: 5 })]);
      (StripePayment.transferForBooking as jest.Mock).mockResolvedValue({ id: 'tr_x' });
      expect(await service.payOutLateFor('b1')).toBe('tr_x');
      expect(prisma.bookingInstallment.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['x1'] }, paid_out_at: null }, data: { paid_out_at: expect.any(Date) } });
      expect(StripePayment.transferForBooking).toHaveBeenCalledWith(expect.objectContaining({ amount: 90, idempotencyKey: 'extras-x1' }));
    });

    it('never pays out on a booking Vendly refunded in full', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: 'b1', status: BookingStatus.COMPLETED, released_at: new Date(), dispute_resolution: 'refund ($100.00 refunded) by admin a: no show', vendor: {} });
      expect(await service.payOutLateFor('b1')).toBeNull();
    });

    it('waits until the booking itself is paid out', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: 'b1', status: BookingStatus.COMPLETED, released_at: null, vendor: {} });
      expect(await service.payOutLateFor('b1')).toBeNull();
      expect(StripePayment.transferForBooking).not.toHaveBeenCalled();
    });
  });

  describe('disputes reach the vendor', () => {
    it('tells the vendor (push and email) and Vendly admins when a customer opens one', async () => {
      prisma.booking.findUnique
        .mockResolvedValueOnce({ customer_id: 'c1', status: BookingStatus.COMPLETED, released_at: null, dispute_opened_at: null })
        .mockResolvedValueOnce({ vendor_id: 'v1', listing: { title: 'Wedding buffet' }, customer: { name: 'Amara' }, vendor: { email: 'v@x.com', name: 'Vee' } });
      await service.openDispute('b1', 'c1', 'The food arrived two hours late and cold');
      expect(push.sendToUser).toHaveBeenCalledWith('v1', expect.objectContaining({ title: 'A customer reported a problem', body: expect.stringContaining('held') }));
      expect(mail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ to: 'v@x.com', status: 'DISPUTED' }));
      expect(push.sendToUser).toHaveBeenCalledWith('admin1', expect.objectContaining({ title: 'New dispute' }));
    });

    it('lets the vendor give their side while the dispute is open', async () => {
      prisma.booking.findUnique.mockResolvedValue({ vendor_id: 'v1', dispute_opened_at: new Date(), dispute_resolved_at: null, listing: { title: 'Buffet' } });
      const res = await service.replyToDispute('b1', 'v1', '  We arrived on time; photos are in the proof tab.  ');
      expect(prisma.booking.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { dispute_vendor_reply: 'We arrived on time; photos are in the proof tab.', dispute_vendor_replied_at: expect.any(Date) } });
      expect(res.data.dispute_vendor_reply).toContain('arrived on time');
    });

    it('refuses a reply from anyone else, or once the dispute is settled', async () => {
      prisma.booking.findUnique.mockResolvedValue({ vendor_id: 'v1', dispute_opened_at: new Date(), dispute_resolved_at: null });
      await expect(service.replyToDispute('b1', 'c1', 'not my booking at all')).rejects.toThrow('Access denied');
      prisma.booking.findUnique.mockResolvedValue({ vendor_id: 'v1', dispute_opened_at: new Date(), dispute_resolved_at: new Date() });
      await expect(service.replyToDispute('b1', 'v1', 'too late for this one')).rejects.toThrow('no open dispute');
    });
  });

  describe('saved cards', () => {
    it('creates a Stripe customer on first setup', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'c1', email: 'a@x.com', name: 'Amara', billing_id: null });
      (StripePayment.createCustomer as jest.Mock).mockResolvedValue({ id: 'cus_new' });
      (StripePayment.createSetupIntent as jest.Mock).mockResolvedValue({ client_secret: 'seti_secret' });
      const res = await service.createSetupIntent('c1');
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { billing_id: 'cus_new' } });
      expect(res.data.client_secret).toBe('seti_secret');
    });

    it('will not remove a card an active booking still needs', async () => {
      prisma.user.findUnique.mockResolvedValue({ billing_id: 'cus_1' });
      (StripePayment.retrievePaymentMethod as jest.Mock).mockResolvedValue({ customer: 'cus_1' });
      prisma.booking.count.mockResolvedValue(1);
      await expect(service.removeCard('c1', 'pm_1')).rejects.toThrow(BadRequestException);
      expect(StripePayment.detachPaymentMethod).not.toHaveBeenCalled();
    });
  });
});
