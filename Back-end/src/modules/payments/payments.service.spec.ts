import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BookingStatus, InstallmentStatus, PaymentPlan } from 'prisma/generated/enums';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';
import { MailService } from 'src/mail/mail.service';
import { PushService } from 'src/modules/push/push.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaymentsService } from './payments.service';

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
  user: { findUnique: jest.fn(), update: jest.fn() },
  booking: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn(), findMany: jest.fn() },
  bookingInstallment: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  bookingProof: { findFirst: jest.fn() },
  paymentTransaction: { create: jest.fn() },
  vendorListing: { findUnique: jest.fn() },
  $transaction: jest.fn(),
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

      expect(StripePayment.chargeSavedCard).toHaveBeenCalledWith(expect.objectContaining({ amount: 247.5, customerId: 'cus_1', paymentMethodId: 'pm_1', captureManually: false, idempotencyKey: 'inst-i1-1' }));
      expect(prisma.bookingInstallment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InstallmentStatus.PAID, payment_intent_id: 'pi_1' }) }));
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
      expect(push.sendToUser).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'Payment problem' }));
    });

    it('gives up after the third attempt', async () => {
      prisma.bookingInstallment.findUnique.mockResolvedValue(installment({ attempts: 2 }));
      (StripePayment.chargeSavedCard as jest.Mock).mockRejectedValue({ code: 'card_declined', raw: { message: 'Declined' } });

      await service.chargeInstallment('i1');

      expect(StripePayment.chargeSavedCard).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'inst-i1-3' }));
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
      expect(prisma.booking.updateMany).not.toHaveBeenCalled();
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
