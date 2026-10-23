import { Test } from '@nestjs/testing';
import { BookingStatus, InstallmentStatus } from 'prisma/generated/enums';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';
import { MailService } from 'src/mail/mail.service';
import { PushService } from 'src/modules/push/push.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaymentsService } from './payments.service';

jest.mock('src/common/lib/Payment/stripe/StripePayment', () => ({
  StripePayment: { retrievePaymentMethod: jest.fn(), chargeSavedCard: jest.fn(), cancelPaymentIntent: jest.fn(), refundPaymentIntent: jest.fn() },
}));
jest.mock('src/config/app.config', () => ({ __esModule: true, default: () => ({ app: { client_app_url: 'https://app.test' } }) }));

const prisma = {
  bookingInstallment: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  booking: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
  paymentTransaction: { create: jest.fn() },
  $transaction: jest.fn(),
  $queryRaw: jest.fn().mockResolvedValue([]),
};
const mail = { sendBookingNotification: jest.fn() };
const push = { sendToUser: jest.fn() };

const paidInstallment = (booking: Record<string, unknown> = {}) => ({
  label: '50% deposit',
  amount: 247.5,
  currency: 'usd',
  paid_at: new Date('2026-10-20T12:00:00Z'),
  booking: {
    id: 'b1',
    status: BookingStatus.CONFIRMED,
    dispute_resolution: null,
    payment_method_id: 'pm_1',
    listing: { title: 'Bridal Glam' },
    rental_reservations: [],
    customer: { email: 'amara@x.com', name: 'Amara' },
    ...booking,
  },
});

describe('receipts and the final invoice email', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
    mail.sendBookingNotification.mockResolvedValue(undefined);
    const mod = await Test.createTestingModule({
      providers: [PaymentsService, { provide: PrismaService, useValue: prisma }, { provide: MailService, useValue: mail }, { provide: PushService, useValue: push }],
    }).compile();
    service = mod.get(PaymentsService);
  });

  describe('sendReceipt', () => {
    it('emails what was charged, the amount, the card, the date and a link to the booking, once', async () => {
      prisma.bookingInstallment.updateMany.mockResolvedValue({ count: 1 });
      prisma.bookingInstallment.findUniqueOrThrow.mockResolvedValue(paidInstallment());
      (StripePayment.retrievePaymentMethod as jest.Mock).mockResolvedValue({ card: { brand: 'visa', last4: '4242' } });

      expect(await service.sendReceipt('i1')).toBe(true);

      expect(prisma.bookingInstallment.updateMany).toHaveBeenCalledWith({ where: { id: 'i1', status: InstallmentStatus.PAID, receipt_sent_at: null }, data: { receipt_sent_at: expect.any(Date) } });
      expect(mail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({
        to: 'amara@x.com',
        subject: 'Receipt — Bridal Glam',
        status: 'RECEIPT',
        ctaUrl: 'https://app.test/bookings/b1',
        lines: [
          { label: 'Charged for', value: '50% deposit' },
          { label: 'Amount', value: '$247.50' },
          { label: 'Card', value: 'Visa •••• 4242' },
          { label: 'Date', value: 'Oct 20, 2026' },
          { label: 'Booking reference', value: 'b1' },
        ],
      }));
    });

    it('sends nothing when the receipt was already claimed', async () => {
      prisma.bookingInstallment.updateMany.mockResolvedValue({ count: 0 });
      expect(await service.sendReceipt('i1')).toBe(false);
      expect(prisma.bookingInstallment.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(mail.sendBookingNotification).not.toHaveBeenCalled();
    });

    it('skips the card when Stripe cannot say which it was', async () => {
      prisma.bookingInstallment.updateMany.mockResolvedValue({ count: 1 });
      prisma.bookingInstallment.findUniqueOrThrow.mockResolvedValue(paidInstallment());
      (StripePayment.retrievePaymentMethod as jest.Mock).mockRejectedValue(new Error('stripe down'));
      await service.sendReceipt('i1');
      const lines = mail.sendBookingNotification.mock.calls[0][0].lines;
      expect(lines.find((l: any) => l.label === 'Card')).toBeUndefined();
    });

    it('sends no receipt for a charge on a booking that already ended (it is handed straight back)', async () => {
      prisma.bookingInstallment.updateMany.mockResolvedValue({ count: 1 });
      prisma.bookingInstallment.findUniqueOrThrow.mockResolvedValue(paidInstallment({ status: BookingStatus.CANCELLED }));
      expect(await service.sendReceipt('i1')).toBe(false);
      expect(mail.sendBookingNotification).not.toHaveBeenCalled();
    });

    it('never throws, so an email problem cannot affect the payment', async () => {
      prisma.bookingInstallment.updateMany.mockRejectedValue(new Error('db gone'));
      jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
      await expect(service.sendReceipt('i1')).resolves.toBe(false);
    });

    it('is sent when a charge succeeds, and a mail failure still leaves the installment paid', async () => {
      prisma.bookingInstallment.findUnique.mockResolvedValue({
        id: 'i1', booking_id: 'b1', label: 'Full payment', amount: 100, currency: 'usd', status: InstallmentStatus.SCHEDULED, attempts: 0, capture_manually: false, updated_at: new Date(),
        booking: { id: 'b1', customer_id: 'c1', payment_method_id: 'pm_1', status: BookingStatus.CONFIRMED, listing: { title: 'Bridal Glam' }, customer: { email: 'amara@x.com', name: 'Amara', billing_id: 'cus_1' } },
      });
      prisma.booking.findUnique.mockResolvedValue({ customer_id: 'c1' });
      prisma.bookingInstallment.updateMany.mockResolvedValue({ count: 1 });
      prisma.bookingInstallment.findUniqueOrThrow.mockResolvedValue({ ...paidInstallment(), id: 'i1', booking_id: 'b1', kind: 'charge', status: InstallmentStatus.PAID });
      (StripePayment.chargeSavedCard as jest.Mock).mockResolvedValue({ id: 'pi_1', status: 'succeeded' });
      mail.sendBookingNotification.mockRejectedValue(new Error('mail queue down'));
      jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);

      const res = await service.chargeInstallment('i1');

      expect(res).toMatchObject({ status: InstallmentStatus.PAID });
      expect(prisma.paymentTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'booking_installment', order_id: 'b1' }) });
      expect(prisma.bookingInstallment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { receipt_sent_at: expect.any(Date) } }));
      // the email never left: the claim is let go so the hourly sweep sends it
      expect(prisma.bookingInstallment.updateMany).toHaveBeenCalledWith({ where: { id: 'i1', receipt_sent_at: expect.any(Date) }, data: { receipt_sent_at: null } });
    });

    it('lets go of the claim when the email could not be queued, so the sweep retries it', async () => {
      prisma.bookingInstallment.updateMany.mockResolvedValue({ count: 1 });
      prisma.bookingInstallment.findUniqueOrThrow.mockResolvedValue(paidInstallment());
      (StripePayment.retrievePaymentMethod as jest.Mock).mockResolvedValue({ card: { brand: 'visa', last4: '4242' } });
      mail.sendBookingNotification.mockResolvedValue(false);
      jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);

      expect(await service.sendReceipt('i1')).toBe(false);

      const [claim, release] = prisma.bookingInstallment.updateMany.mock.calls.map((c: any) => c[0]);
      expect(claim.data.receipt_sent_at).toBeInstanceOf(Date);
      // only our own claim is let go
      expect(release).toEqual({ where: { id: 'i1', receipt_sent_at: claim.data.receipt_sent_at }, data: { receipt_sent_at: null } });
    });

    it('keeps the claim when there is deliberately nothing to send', async () => {
      prisma.bookingInstallment.updateMany.mockResolvedValue({ count: 1 });
      prisma.bookingInstallment.findUniqueOrThrow.mockResolvedValue(paidInstallment({ status: BookingStatus.CANCELLED }));
      await service.sendReceipt('i1');
      expect(prisma.bookingInstallment.updateMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('runReceiptSweep', () => {
    it('sends missed receipts and invoices from the last 7 days only', async () => {
      const now = new Date('2026-10-23T12:00:00Z');
      prisma.bookingInstallment.findMany.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]);
      prisma.booking.findMany.mockResolvedValue([{ id: 'b9' }]);
      const receipt = jest.spyOn(service, 'sendReceipt').mockResolvedValue(true);
      const invoice = jest.spyOn(service, 'sendFinalInvoice').mockResolvedValue(true);

      expect(await service.runReceiptSweep(now)).toEqual({ receipts: 2, invoices: 1 });

      const since = new Date('2026-10-16T12:00:00Z');
      expect(prisma.bookingInstallment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: InstallmentStatus.PAID, receipt_sent_at: null, paid_at: { gte: since } } }));
      expect(prisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { invoice_sent_at: null, paid_at: { not: null }, OR: [{ released_at: { gte: since } }, { status: BookingStatus.CANCELLED, cancelled_at: { gte: since } }] },
      }));
      expect(receipt.mock.calls.map((c) => c[0])).toEqual(['i1', 'i2']);
      expect(invoice).toHaveBeenCalledWith('b9');
    });
  });

  describe('sendFinalInvoice', () => {
    it('claims the invoice once the money is final and emails the totals with a link to download it', async () => {
      prisma.booking.updateMany.mockResolvedValue({ count: 1 });
      prisma.booking.findUniqueOrThrow.mockResolvedValue({
        id: 'b1', status: BookingStatus.CANCELLED, currency: 'usd', listing: { title: 'Bridal Glam' }, rental_reservations: [], customer: { email: 'amara@x.com', name: 'Amara' },
        installments: [{ status: InstallmentStatus.PAID, amount: 300, refunded_amount: 250 }, { status: InstallmentStatus.CANCELLED, amount: 750, refunded_amount: 0 }],
      });

      expect(await service.sendFinalInvoice('b1')).toBe(true);

      expect(prisma.booking.updateMany).toHaveBeenCalledWith({
        where: { id: 'b1', invoice_sent_at: null, paid_at: { not: null }, OR: [{ released_at: { not: null } }, { status: BookingStatus.CANCELLED }] },
        data: { invoice_sent_at: expect.any(Date) },
      });
      expect(mail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({
        subject: 'Your invoice — Bridal Glam',
        ctaLabel: 'Download invoice',
        ctaUrl: 'https://app.test/bookings/b1',
        lines: [{ label: 'Total charged', value: '$300.00' }, { label: 'Refunded', value: '$250.00' }, { label: 'Total paid', value: '$50.00' }],
      }));
    });

    it('lets go of the claim when the email could not be queued, so the sweep retries it', async () => {
      prisma.booking.updateMany.mockResolvedValue({ count: 1 });
      prisma.booking.findUniqueOrThrow.mockResolvedValue({
        id: 'b1', status: BookingStatus.COMPLETED, currency: 'usd', listing: { title: 'Bridal Glam' }, rental_reservations: [], customer: { email: 'amara@x.com', name: 'Amara' },
        installments: [{ status: InstallmentStatus.PAID, amount: 300, refunded_amount: 0 }],
      });
      mail.sendBookingNotification.mockResolvedValue(false);
      jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);

      expect(await service.sendFinalInvoice('b1')).toBe(false);

      const [claim, release] = prisma.booking.updateMany.mock.calls.map((c: any) => c[0]);
      expect(release).toEqual({ where: { id: 'b1', invoice_sent_at: claim.data.invoice_sent_at }, data: { invoice_sent_at: null } });
    });

    it('sends nothing twice, or before the money is final', async () => {
      prisma.booking.updateMany.mockResolvedValue({ count: 0 });
      expect(await service.sendFinalInvoice('b1')).toBe(false);
      expect(mail.sendBookingNotification).not.toHaveBeenCalled();
    });
  });
});
