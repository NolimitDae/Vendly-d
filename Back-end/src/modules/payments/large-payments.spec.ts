import { BadRequestException, ConflictException } from '@nestjs/common';
import { BookingStatus, InstallmentStatus, PaymentPlan } from 'prisma/generated/enums';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';
import { __setFeeCache, currentFees, PlatformSettingsService, platformServiceFee } from 'src/modules/platform/platform-settings.service';
import { isLargeTotal, largePaymentThreshold, serviceFeeFor } from 'src/modules/platform/fee-config';
import { renderTemplate } from 'src/modules/contracts/contract-merge';
import { DEPOSIT_CLAUSE, defaultTemplates, withLargePaymentDeadline } from 'src/modules/contracts/contract-templates';
import { VendorContractsService } from 'src/modules/contracts/vendor-contracts.service';
import { autoRetryAt, paymentDueBy, paymentDueRules } from './payment-due';
import { bankNotAllowedReason, isClearing } from './bank-payments';
import { PaymentsService } from './payments.service';

jest.mock('src/common/lib/Payment/stripe/StripePayment', () => ({
  StripePayment: {
    createCustomer: jest.fn(),
    createSetupIntent: jest.fn(),
    createBankSetupIntent: jest.fn(),
    listCards: jest.fn(),
    listBankAccounts: jest.fn(),
    getCustomerByID: jest.fn(),
    retrievePaymentMethod: jest.fn(),
    chargeSavedCard: jest.fn(),
    cancelPaymentIntent: jest.fn(),
    transferForBooking: jest.fn(),
    refundPaymentIntent: jest.fn(),
  },
}));
jest.mock('src/config/app.config', () => ({ __esModule: true, default: () => ({ app: { client_app_url: 'https://app.test' }, fees: { customer_service_fee_percent: 5, customer_service_fee_minimum: 3 } }) }));

const HOUR = 3600 * 1000;

afterEach(() => __setFeeCache(null));

describe('the Vendly Protection fee cap', () => {
  it('caps the fee at the maximum, keeps the minimum, and no cap means none', () => {
    expect(serviceFeeFor(20000, 5, 3, 500)).toBe(500);
    expect(serviceFeeFor(6000, 5, 3, 500)).toBe(300);
    expect(serviceFeeFor(20, 5, 3, 500)).toBe(3);
    expect(serviceFeeFor(20000, 5, 3, 0)).toBe(1000);
    expect(serviceFeeFor(0, 5, 3, 500)).toBe(0);
  });

  it('defaults to $500 when nothing is saved', () => {
    expect(currentFees().maximum).toBe(500);
    expect(platformServiceFee(20000)).toBe(500);
    expect(platformServiceFee(1000)).toBe(50);
  });

  it('applies to category overrides too', () => {
    __setFeeCache({ percent: 5, minimum: 3, maximum: 500, commission: 0, categories: new Map([['venues', 10]]) });
    // 10% of $6,000 would be $600
    expect(platformServiceFee(6000, 'venues')).toBe(500);
    expect(platformServiceFee(4000, 'venues')).toBe(400);
    expect(platformServiceFee(6000)).toBe(300);
  });

  it('loads the admin settings: an empty maximum is no cap, and the large booking threshold', async () => {
    const prisma: any = {
      platformSetting: {
        findMany: jest.fn().mockResolvedValue([
          { key: 'customer_service_fee_maximum', value: '' },
          { key: 'large_payment_threshold', value: '10000' },
        ]),
        upsert: jest.fn(),
      },
      serviceCategory: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    const svc = new PlatformSettingsService(prisma);
    await svc.refresh();
    expect(platformServiceFee(20000)).toBe(1000);
    expect(largePaymentThreshold()).toBe(10000);
    expect(isLargeTotal(9999.99)).toBe(false);
    expect(isLargeTotal(10000)).toBe(true);
    // the public wording settings
    expect(svc.paymentSettings().data).toMatchObject({ fee_percent: 5, fee_maximum: null, large_payment_threshold: 10000, payment_due_hours: 12, large_payment_due_hours: 48 });
    await expect(svc.update({ customer_service_fee_maximum: '-5' })).rejects.toThrow(BadRequestException);

    // a saved cap, and the settings page lists both new settings
    prisma.platformSetting.findMany.mockResolvedValue([{ key: 'customer_service_fee_maximum', value: '250' }]);
    await svc.refresh();
    expect(platformServiceFee(20000)).toBe(250);
    expect(largePaymentThreshold()).toBe(5000);
    prisma.serviceCategory.findMany.mockResolvedValue([]);
    const all = await svc.getAll();
    expect(all.data.settings.map((s: any) => s.key)).toEqual(expect.arrayContaining(['customer_service_fee_maximum', 'large_payment_threshold']));
  });
});

describe('large bookings', () => {
  it('a total at or above the threshold ($5,000 by default) is large; 0 switches it off', () => {
    expect(isLargeTotal(5000)).toBe(true);
    expect(isLargeTotal(4999.99)).toBe(false);
    __setFeeCache({ percent: 5, minimum: 3, commission: 0, categories: new Map(), largeThreshold: 0 });
    expect(isLargeTotal(1_000_000)).toBe(false);
  });

  it('get 48 hours to fix a failed payment: the retry about 24 hours in, the reminder with about 6 left', () => {
    expect(paymentDueRules(false)).toEqual({ dueHours: 12, retryHours: 6, reminderHours: 2 });
    expect(paymentDueRules(true)).toEqual({ dueHours: 48, retryHours: 24, reminderHours: 6 });
    const now = new Date('2026-11-05T10:00:00Z');
    const dueBy = paymentDueBy(now, 48);
    expect(dueBy.getTime() - now.getTime()).toBe(48 * HOUR);
    expect(autoRetryAt(now, dueBy, 24)!.getTime() - now.getTime()).toBe(24 * HOUR);
    // the 12-hour default is unchanged
    expect(paymentDueBy(now).getTime() - now.getTime()).toBe(12 * HOUR);
  });

  it('only large bookings without a card hold can be paid from a bank account', () => {
    expect(bankNotAllowedReason({ total: 4000, plan: PaymentPlan.DEPOSIT_50 })).toBe('Bank payments are for bookings of $5,000 or more. Please choose a card.');
    expect(bankNotAllowedReason({ total: 6300, plan: PaymentPlan.DEPOSIT_50 })).toBeNull();
    expect(bankNotAllowedReason({ total: 6300, plan: PaymentPlan.PAY_AFTER_SERVICE })).toMatch(/holds a card/);
    expect(bankNotAllowedReason({ total: 6300, plan: PaymentPlan.FULL_ON_ACCEPT, securityDeposit: 200 })).toMatch(/security deposit/);
  });

  it('the deposit clause says 48 hours on bookings of $5,000 or more, once, and drops it when switched off', () => {
    const on = renderTemplate(DEPOSIT_CLAUSE, { customer_role_label: 'Customer', large_payment_threshold: '$5,000' });
    expect(on).toContain("wasn't made within 12 hours of failing (48 hours on bookings of $5,000 or more).");
    const off = renderTemplate(DEPOSIT_CLAUSE, { customer_role_label: 'Customer', large_payment_threshold: '' });
    expect(off).toContain("wasn't made within 12 hours of failing. Anything paid");
    // an Oct 2026 body gets it in place, and only once
    const old = `## 5. Cancellation\nPolicy.\n${DEPOSIT_CLAUSE.replace(/\{\{#large_payment_threshold\}\}.*\{\{\/large_payment_threshold\}\}/, '')}\n- ${DEPOSIT_CLAUSE.replace(/\{\{#large_payment_threshold\}\}.*\{\{\/large_payment_threshold\}\}/, '')}`;
    const updated = withLargePaymentDeadline(old)!;
    expect(updated.match(/48 hours on bookings of/g)).toHaveLength(2);
    expect(updated.match(/Deposits:/g)).toHaveLength(2);
    expect(withLargePaymentDeadline(updated)).toBeNull();
  });
});

describe('publishing the 48-hour deadline in the contract templates', () => {
  const LARGE = /\{\{#large_payment_threshold\}\}.*?\{\{\/large_payment_threshold\}\}/g;
  it('publishes the next version of a template whose clause still says only 12 hours, once', async () => {
    const t = defaultTemplates()[0];
    const v2 = { id: 't2', category: t.category, title: t.title, body: t.body.replace(LARGE, ''), required_fields: t.required_fields, version: 2, status: 'ACTIVE' };
    const prisma: any = {
      contractTemplate: {
        findFirst: jest.fn().mockResolvedValue(v2),
        findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.category === t.category ? [v2] : [{ ...v2, category: where.category, body: defaultTemplates().find((d) => d.category === where.category)!.body }])),
        update: jest.fn().mockReturnValue('update'),
        create: jest.fn().mockReturnValue('create'),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    await new VendorContractsService(prisma).ensureDefaultTemplates();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.contractTemplate.update).toHaveBeenCalledWith({ where: { id: 't2' }, data: { status: 'RETIRED' } });
    const created = prisma.contractTemplate.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ version: 3, status: 'ACTIVE' });
    expect(created.body).toBe(t.body);
    // the clause isn't repeated
    expect(created.body.match(/Deposits:/g)?.length).toBe(t.body.match(/Deposits:/g)?.length);
  });
});

// ─── The payment engine: bank payments (ACH) and the 48-hour window ────────────────

const BANK_BOOKING = {
  id: 'b1', customer_id: 'c1', vendor_id: 'v1', payment_method_id: 'pm_bank', payment_method_type: 'us_bank_account', status: BookingStatus.CONFIRMED,
  payment_plan: PaymentPlan.DEPOSIT_50, deposit_rules: true, payment_due_by: null, amount: 6000, service_fee: 300, dispute_resolution: null,
  listing: { title: 'Gala dinner' }, customer: { email: 'c@x.com', name: 'Cee', billing_id: 'cus_1' }, vendor: { email: 'v@x.com', name: 'Vee' },
};
const inst = (over: Record<string, unknown> = {}) => ({
  id: 'i1', booking_id: 'b1', sequence: 1, kind: 'charge', label: '50% deposit', amount: 3300, fee_amount: 300, currency: 'usd', due_at: new Date(), status: InstallmentStatus.SCHEDULED,
  capture_manually: false, payment_intent_id: null, attempts: 0, next_attempt_at: null, last_error: null, paid_at: null, refunded_amount: 0, paid_out_at: null, clearing_since: null, payment_method_type: null,
  updated_at: null, booking: BANK_BOOKING,
  ...over,
});

function setup() {
  const prisma: any = {
    user: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([{ id: 'admin1' }]) },
    booking: { findUnique: jest.fn().mockResolvedValue(BANK_BOOKING), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]) },
    bookingInstallment: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(({ data }: any) => Promise.resolve({ ...inst(), ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    bookingContract: { findFirst: jest.fn().mockResolvedValue({ merge_data: { timezone: 'America/New_York' } }) },
    bookingExtra: { findFirst: jest.fn().mockResolvedValue(null) },
    paymentTransaction: { create: jest.fn(), updateMany: jest.fn(), count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
    rentalReservation: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: any) => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn)));
  const mail: any = { sendBookingNotification: jest.fn().mockResolvedValue(undefined) };
  const push: any = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  return { service: new PaymentsService(prisma, mail, push), prisma, mail, push };
}

describe('bank payments (ACH) on large bookings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('a bank charge comes back processing: the installment is clearing, not paid and not failed', async () => {
    const { service, prisma, push } = setup();
    prisma.bookingInstallment.findUnique.mockResolvedValue(inst());
    prisma.bookingInstallment.findUniqueOrThrow.mockResolvedValue(inst({ status: InstallmentStatus.PROCESSING, payment_intent_id: 'pi_ach', clearing_since: new Date() }));
    (StripePayment.chargeSavedCard as jest.Mock).mockResolvedValue({ id: 'pi_ach', status: 'processing' });

    const res: any = await service.chargeInstallment('i1');

    expect(StripePayment.chargeSavedCard).toHaveBeenCalledWith(expect.objectContaining({ paymentMethodId: 'pm_bank', bank: true, captureManually: false, amount: 3300 }));
    // claimed as a bank attempt, then marked clearing
    expect(prisma.bookingInstallment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InstallmentStatus.PROCESSING, payment_method_type: 'us_bank_account' }) }));
    expect(prisma.bookingInstallment.updateMany).toHaveBeenCalledWith({
      where: { id: 'i1', status: InstallmentStatus.PROCESSING, clearing_since: null },
      data: expect.objectContaining({ payment_intent_id: 'pi_ach', clearing_since: expect.any(Date) }),
    });
    expect(isClearing(res)).toBe(true);
    // nothing paid yet: no PAID move, no paid_at on the booking
    expect(prisma.bookingInstallment.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InstallmentStatus.PAID }) }));
    expect(prisma.booking.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: { paid_at: expect.any(Date) } }));
    expect(prisma.paymentTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'booking_installment', status: 'processing', reference_number: 'pi_ach' }) });
    expect(push.sendToUser).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'Bank payment processing' }), 'payments');
  });

  it('processing → succeeded: paid when Stripe says it cleared', async () => {
    const { service, prisma } = setup();
    const clearing = inst({ status: InstallmentStatus.PROCESSING, payment_intent_id: 'pi_ach', clearing_since: new Date(), payment_method_type: 'us_bank_account' });
    prisma.bookingInstallment.findUnique.mockResolvedValueOnce(clearing).mockResolvedValue({ ...clearing, status: InstallmentStatus.PAID, booking: { status: BookingStatus.CONFIRMED, dispute_resolution: null } });
    prisma.bookingInstallment.findUniqueOrThrow.mockResolvedValue({ ...clearing, status: InstallmentStatus.PAID });
    prisma.booking.findUnique.mockResolvedValue({ customer_id: 'c1' });

    await service.reconcilePaymentIntent({ id: 'pi_ach', status: 'succeeded', metadata: { installment_id: 'i1' } });

    expect(prisma.bookingInstallment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InstallmentStatus.PAID, clearing_since: null }) }));
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: 'b1', paid_at: null }, data: { paid_at: expect.any(Date) } });
  });

  it('processing → failed: the large booking gets 48 hours to pay another way (no automatic retry on the bank)', async () => {
    const { service, prisma, mail, push } = setup();
    const clearing = inst({ status: InstallmentStatus.PROCESSING, payment_intent_id: 'pi_ach', clearing_since: new Date(), attempts: 1, payment_method_type: 'us_bank_account' });
    prisma.bookingInstallment.findUnique.mockResolvedValue(clearing);
    const before = Date.now();

    await service.reconcilePaymentIntent({ id: 'pi_ach', status: 'requires_payment_method', metadata: { installment_id: 'i1' }, last_payment_error: { message: 'The account has insufficient funds.' } });

    const due = prisma.booking.updateMany.mock.calls.find((c: any) => c[0].data.payment_due_by)[0];
    expect(due.data.payment_due_kind).toBe('deposit');
    expect(due.data.payment_due_by.getTime()).toBeGreaterThanOrEqual(before + 48 * HOUR - 1000);
    expect(due.data.payment_due_by.getTime()).toBeLessThanOrEqual(Date.now() + 48 * HOUR);
    const row = prisma.bookingInstallment.update.mock.calls[0][0].data;
    expect(row).toMatchObject({ status: InstallmentStatus.FAILED, next_attempt_at: null });
    expect(row.last_error).toMatch(/insufficient funds/);
    expect(prisma.paymentTransaction.updateMany).toHaveBeenCalledWith({ where: { reference_number: 'pi_ach', type: 'booking_installment', status: 'processing' }, data: { status: 'failed' } });
    expect(mail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ to: 'c@x.com', subject: expect.stringMatching(/^Payment needed by/) }));
    // the vendor hears the 48 hours
    expect(push.sendToUser).toHaveBeenCalledWith('v1', expect.objectContaining({ body: expect.stringContaining('(48 hours)') }), 'booking_updates');
  });

  it('a declined card on a large deposit booking: 48 hours, retried once about 24 hours in', async () => {
    const { service, prisma } = setup();
    prisma.bookingInstallment.findUnique.mockResolvedValue(inst({ booking: { ...BANK_BOOKING, payment_method_id: 'pm_card', payment_method_type: null } }));
    (StripePayment.chargeSavedCard as jest.Mock).mockRejectedValue({ code: 'card_declined', raw: { message: 'Your card was declined.' } });
    const before = Date.now();

    await service.chargeInstallment('i1');

    expect(StripePayment.chargeSavedCard).toHaveBeenCalledWith(expect.not.objectContaining({ bank: true }));
    const due = prisma.booking.updateMany.mock.calls.find((c: any) => c[0].data.payment_due_by)[0];
    expect(due.data.payment_due_by.getTime() - before).toBeGreaterThanOrEqual(48 * HOUR - 1000);
    const row = prisma.bookingInstallment.update.mock.calls[0][0].data;
    expect(row.status).toBe(InstallmentStatus.SCHEDULED);
    expect(row.next_attempt_at.getTime() - before).toBeGreaterThanOrEqual(24 * HOUR - 1000);
    expect(row.next_attempt_at.getTime() - before).toBeLessThan(25 * HOUR);
  });

  it('a bank payment returned after it cleared: unpaid again, the vendor’s payout recovered, the customer asked to pay', async () => {
    const { service, prisma, push } = setup();
    const paid = inst({ status: InstallmentStatus.PAID, payment_intent_id: 'pi_ach', payment_method_type: 'us_bank_account', paid_at: new Date(), paid_out_at: new Date(), attempts: 1 });
    prisma.bookingInstallment.findUnique.mockResolvedValue(paid);
    prisma.booking.findUnique.mockImplementation(({ select }: any) =>
      Promise.resolve(
        select?.installments
          ? { id: 'b1', vendor_id: 'v1', customer_id: 'c1', status: BookingStatus.COMPLETED, currency: 'usd', early_released_amount: 0, released_gross: 6000, commission_amount: 0, installments: [{ id: 'i1', status: InstallmentStatus.PAID }, { id: 'i2', status: InstallmentStatus.PAID }] }
          : { ...BANK_BOOKING, status: BookingStatus.COMPLETED },
      ),
    );

    await service.reconcilePaymentIntent({ id: 'pi_ach', status: 'requires_payment_method', metadata: { installment_id: 'i1' }, last_payment_error: { message: 'Account closed' } });

    expect(prisma.bookingInstallment.updateMany).toHaveBeenCalledWith({
      where: { id: 'i1', status: InstallmentStatus.PAID, payment_intent_id: 'pi_ach' },
      data: expect.objectContaining({ status: InstallmentStatus.FAILED, paid_at: null, paid_out_at: null }),
    });
    expect(prisma.paymentTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'booking_payment_returned', amount: -3300 }) });
    // the vendor had been paid $3,000 for it (no commission): taken back from their balance
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { balance: { increment: -3000 } } });
    expect(prisma.paymentTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'payout_recovery', amount: -3000 }) });
    // the job is done: asked to pay, without a cancellation deadline
    expect(prisma.booking.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ payment_due_by: expect.any(Date) }) }));
    expect(prisma.bookingInstallment.update.mock.calls[0][0].data).toMatchObject({ status: InstallmentStatus.FAILED });
    expect(push.sendToUser).toHaveBeenCalledWith('admin1', expect.objectContaining({ title: 'Bank payment returned' }));

    // Stripe delivers it again: nothing more happens
    prisma.bookingInstallment.findUnique.mockResolvedValue({ ...paid, status: InstallmentStatus.FAILED });
    prisma.user.update.mockClear();
    await service.reconcilePaymentIntent({ id: 'pi_ach', status: 'requires_payment_method', metadata: { installment_id: 'i1' } });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('a returned deposit that was released early is owed back, and no longer taken off the final payout', async () => {
    const { service, prisma } = setup();
    prisma.bookingInstallment.findUnique.mockResolvedValue(inst({ status: InstallmentStatus.PAID, payment_intent_id: 'pi_ach', payment_method_type: 'us_bank_account', paid_at: new Date(), attempts: 1 }));
    prisma.booking.findUnique.mockImplementation(({ select }: any) =>
      Promise.resolve(select?.installments ? { id: 'b1', vendor_id: 'v1', customer_id: 'c1', status: BookingStatus.CONFIRMED, currency: 'usd', early_released_amount: 3000, released_gross: null, commission_amount: null, installments: [{ id: 'i1', status: InstallmentStatus.PAID }] } : BANK_BOOKING),
    );

    await service.reconcilePaymentIntent({ id: 'pi_ach', status: 'requires_payment_method', metadata: { installment_id: 'i1' }, last_payment_error: { message: 'Not authorized' } });

    expect(prisma.booking.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { early_released_amount: 0 } });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { balance: { increment: -3000 } } });
    // nothing else was paid on the booking
    expect(prisma.booking.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { paid_at: null } });
    // still on: the usual 48 hours to pay the deposit another way
    expect(prisma.booking.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ payment_due_kind: 'deposit' }) }));
  });

  it('the vendor is paid out only once the bank payment has cleared', async () => {
    const { service, prisma } = setup();
    prisma.booking.findUnique.mockResolvedValue({
      id: 'b1', status: BookingStatus.COMPLETED, released_at: null, paid_at: new Date(), currency: 'usd', vendor_id: 'v1', amount: 6000, payout_credited_at: null, dispute_opened_at: null, dispute_resolved_at: null, early_released_amount: 0,
      vendor: { stripe_connect_id: 'acct_1', balance: 0 },
      installments: [inst({ status: InstallmentStatus.PAID, paid_at: new Date() }), inst({ id: 'i2', sequence: 2, status: InstallmentStatus.PROCESSING, clearing_since: new Date(), amount: 3000, fee_amount: 0 })],
    });

    expect(await service.releaseBooking('b1')).toBeNull();
    expect(StripePayment.transferForBooking).not.toHaveBeenCalled();
    expect(prisma.booking.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ released_at: expect.any(Date) }) }));

    // the hourly sweep leaves bookings with a payment still clearing out of its batch
    await service.runReleases(new Date());
    expect(prisma.booking.findMany.mock.calls[0][0].where.installments).toEqual({ none: { status: InstallmentStatus.PROCESSING, clearing_since: { not: null } } });
  });

  it('an early deposit release waits for the bank payment to clear', async () => {
    const { service, prisma } = setup();
    prisma.booking.findUnique.mockResolvedValue({
      vendor_id: 'v1', status: BookingStatus.CONFIRMED, currency: 'usd', payment_plan: PaymentPlan.DEPOSIT_50, early_released_amount: 0, dispute_opened_at: null, dispute_resolved_at: null,
      vendor: { stripe_connect_id: 'acct_1' }, contracts: [{ id: 'k1' }],
      installments: [inst({ status: InstallmentStatus.PROCESSING, clearing_since: new Date() }), inst({ id: 'i2', sequence: 2 })],
    });
    await expect(service.releaseDepositEarly('b1', 'v1')).rejects.toThrow(/still clearing/);
    expect(StripePayment.transferForBooking).not.toHaveBeenCalled();
  });

  it('the customer can’t pay again while a bank payment is on its way', async () => {
    const { service, prisma } = setup();
    prisma.bookingInstallment.findFirst.mockResolvedValue(inst({ status: InstallmentStatus.PROCESSING, clearing_since: new Date(), booking: { ...BANK_BOOKING } }));
    await expect(service.retryInstallment('b1', 'i1', 'c1')).rejects.toThrow(ConflictException);
  });

  it('a bank account is refused on a booking under the threshold', async () => {
    const { service, prisma } = setup();
    prisma.bookingInstallment.findFirst.mockResolvedValue(inst({ status: InstallmentStatus.FAILED, booking: { ...BANK_BOOKING, amount: 1000, service_fee: 50, security_deposit: null } }));
    prisma.user.findUnique.mockResolvedValue({ billing_id: 'cus_1' });
    (StripePayment.retrievePaymentMethod as jest.Mock).mockResolvedValue({ id: 'pm_bank', type: 'us_bank_account', customer: 'cus_1' });
    await expect(service.retryInstallment('b1', 'i1', 'c1', 'pm_bank')).rejects.toThrow('Bank payments are for bookings of $5,000 or more. Please choose a card.');
  });

  it('says clearly when bank payments aren’t switched on in Stripe', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'c1', email: 'c@x.com', name: 'Cee', billing_id: 'cus_1' });
    (StripePayment.getCustomerByID as jest.Mock).mockResolvedValue({ id: 'cus_1' });
    (StripePayment.createBankSetupIntent as jest.Mock).mockRejectedValue({ message: 'The payment method type provided: us_bank_account is invalid. Please ensure the provided type is activated in your dashboard.' });
    await expect(service.createSetupIntent('c1', 'us_bank_account')).rejects.toThrow('Bank payments aren’t available yet. Please use a card for now.');
    (StripePayment.createBankSetupIntent as jest.Mock).mockResolvedValue({ client_secret: 'seti_secret' });
    await expect(service.createSetupIntent('c1', 'us_bank_account')).resolves.toMatchObject({ data: { client_secret: 'seti_secret', type: 'us_bank_account' } });
  });

  it('lists saved bank accounts next to cards for apps that ask', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ billing_id: 'cus_1' });
    (StripePayment.listCards as jest.Mock).mockResolvedValue([{ id: 'pm_card', card: { brand: 'visa', last4: '4242', exp_month: 1, exp_year: 2030 } }]);
    (StripePayment.getCustomerByID as jest.Mock).mockResolvedValue({ invoice_settings: { default_payment_method: 'pm_card' } });
    (StripePayment.listBankAccounts as jest.Mock).mockResolvedValue([{ id: 'pm_bank', us_bank_account: { bank_name: 'STRIPE TEST BANK', last4: '6789', account_type: 'checking' } }]);
    const plain = await service.listCards('c1');
    expect(plain.data.map((m: any) => m.id)).toEqual(['pm_card']);
    const both = await service.listCards('c1', true);
    expect(both.data).toEqual([
      expect.objectContaining({ id: 'pm_card', type: 'card', is_default: true }),
      expect.objectContaining({ id: 'pm_bank', type: 'us_bank_account', last4: '6789', is_default: false }),
    ]);
    (StripePayment.retrievePaymentMethod as jest.Mock).mockResolvedValue({ type: 'us_bank_account', us_bank_account: { last4: '6789' } });
    expect(await service.cardLabel('pm_bank')).toBe('Bank account •••• 6789');
  });
});

describe('dispute refunds are limited by what was paid, not a fixed amount', () => {
  const booking = (paid: number) => ({
    customer_id: 'c1', status: BookingStatus.COMPLETED, released_at: null, dispute_opened_at: null, amount: paid - 500, service_fee: 500, paid_at: new Date(), payment_transaction_id: null,
    installments: [{ kind: 'charge', status: InstallmentStatus.PAID, amount: paid, fee_amount: 500, refunded_amount: 0 }],
  });
  const setupDispute = (paid: number) => {
    const prisma: any = {
      booking: {
        findUnique: jest.fn().mockResolvedValueOnce(booking(paid)).mockResolvedValue({ vendor_id: 'v1', listing: { title: 'Estate wedding' }, customer: { name: 'Cee' }, vendor: { email: null, name: 'Vee' } }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      paymentTransaction: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const push: any = { sendToUser: jest.fn() };
    return { service: new PaymentsService(prisma, { sendBookingNotification: jest.fn() } as any, push), prisma };
  };

  it('a partial refund above $100,000 on a large booking is accepted while under what was paid', async () => {
    const { service, prisma } = setupDispute(150500);
    await service.openDispute('b1', 'c1', { reason: 'The venue flooded and half the event was cancelled', outcome: 'partial_refund', requested_amount: 120000 });
    expect(prisma.booking.updateMany.mock.calls[0][0].data).toMatchObject({ dispute_requested_amount: 120000 });
  });

  it('never more than was paid, with a clear message', async () => {
    const { service } = setupDispute(150500);
    await expect(service.openDispute('b1', 'c1', { reason: 'The venue flooded and half the event was cancelled', outcome: 'partial_refund', requested_amount: 160000 })).rejects.toThrow(
      'You can ask for up to $150,500.00, what you’ve paid for this booking.',
    );
  });
});

describe('review fixes: windows, completed bookings, partial refunds, bank checks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('a missed deposit paid from a bank account: the window pauses while it clears (no "Pending deposit", no deadline)', async () => {
    const { service, prisma } = setup();
    const dueBy = new Date(Date.now() + 2 * HOUR);
    prisma.bookingInstallment.findUnique.mockResolvedValue(inst({ status: InstallmentStatus.SCHEDULED, attempts: 0 }));
    prisma.bookingInstallment.findUniqueOrThrow.mockResolvedValue(inst({ status: InstallmentStatus.PROCESSING, clearing_since: new Date(), payment_intent_id: 'pi_ach' }));
    prisma.booking.findUnique.mockImplementation(({ select }: any) =>
      Promise.resolve(select?.payment_due_kind ? { payment_due_by: dueBy, payment_due_kind: 'deposit', payment_plan: PaymentPlan.DEPOSIT_50, installments: [{ id: 'i1', sequence: 1, status: InstallmentStatus.PROCESSING, attempts: 1 }] } : { ...BANK_BOOKING, payment_due_by: dueBy }),
    );
    (StripePayment.chargeSavedCard as jest.Mock).mockResolvedValue({ id: 'pi_ach', status: 'processing' });

    await service.chargeInstallment('i1');

    expect(prisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: 'b1', payment_due_by: dueBy }, data: { payment_due_by: null, payment_due_kind: null, payment_due_reminded_at: null } });
  });

  it('a failing bank payment inside an old window starts a fresh 48 hours instead of keeping a deadline that has passed', async () => {
    const { service, prisma } = setup();
    const old = new Date(Date.now() - HOUR);
    prisma.bookingInstallment.findUnique.mockResolvedValue(inst({ status: InstallmentStatus.PROCESSING, clearing_since: new Date(), payment_intent_id: 'pi_ach', attempts: 1, payment_method_type: 'us_bank_account' }));
    prisma.booking.findUnique.mockImplementation(({ select }: any) =>
      Promise.resolve(select?.payment_due_kind ? { payment_due_by: old, payment_due_kind: 'deposit', payment_plan: PaymentPlan.DEPOSIT_50, installments: [{ id: 'i1', sequence: 1, status: InstallmentStatus.PROCESSING, attempts: 1 }] } : { ...BANK_BOOKING, payment_due_by: old }),
    );
    const before = Date.now();

    await service.reconcilePaymentIntent({ id: 'pi_ach', status: 'requires_payment_method', metadata: { installment_id: 'i1' }, last_payment_error: { message: 'Insufficient funds' } });

    expect(prisma.booking.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { payment_due_by: null, payment_due_kind: null, payment_due_reminded_at: null } }));
    const fresh = prisma.booking.updateMany.mock.calls.find((c: any) => c[0].data.payment_due_by)[0];
    expect(fresh.data.payment_due_by.getTime() - before).toBeGreaterThanOrEqual(48 * HOUR - 1000);
  });

  it('a custom plan’s payment failing after the job is done: the usual retries and "Payment problem", not a cancellation window', async () => {
    const { service, prisma, push } = setup();
    prisma.bookingInstallment.findMany = jest.fn().mockResolvedValue([{ id: 'p1', kind: 'charge', sequence: 1, status: InstallmentStatus.PAID }, { id: 'i1', kind: 'charge', sequence: 2, status: InstallmentStatus.PROCESSING }]);
    prisma.bookingInstallment.findUnique.mockResolvedValue(inst({ sequence: 2, label: 'After the event', booking: { ...BANK_BOOKING, payment_method_type: null, payment_method_id: 'pm_card', payment_plan: PaymentPlan.CUSTOM, status: BookingStatus.COMPLETED } }));
    (StripePayment.chargeSavedCard as jest.Mock).mockRejectedValue({ code: 'card_declined', raw: { message: 'Your card was declined.' } });

    await service.chargeInstallment('i1');

    expect(prisma.booking.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ payment_due_by: expect.any(Date) }) }));
    const row = prisma.bookingInstallment.update.mock.calls[0][0].data;
    expect(row).toMatchObject({ status: InstallmentStatus.SCHEDULED, attempts: 1 });
    expect(push.sendToUser).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'Payment problem' }), 'payments');
  });

  it('a bank payment returned after a partial refund is owed again only for what the customer kept', async () => {
    const { service, prisma, mail } = setup();
    prisma.bookingInstallment.findUnique.mockResolvedValue(inst({ status: InstallmentStatus.PAID, payment_intent_id: 'pi_ach', payment_method_type: 'us_bank_account', paid_at: new Date(), attempts: 1, refunded_amount: 1000 }));
    prisma.booking.findUnique.mockImplementation(({ select }: any) =>
      Promise.resolve(select?.installments && !select?.payment_due_kind ? { id: 'b1', vendor_id: 'v1', customer_id: 'c1', status: BookingStatus.CONFIRMED, currency: 'usd', early_released_amount: 0, released_gross: null, commission_amount: null, installments: [{ id: 'i1', status: InstallmentStatus.PAID }] } : BANK_BOOKING),
    );

    await service.reconcilePaymentIntent({ id: 'pi_ach', status: 'requires_payment_method', metadata: { installment_id: 'i1' }, last_payment_error: { message: 'Account closed' } });

    expect(prisma.bookingInstallment.updateMany).toHaveBeenCalledWith({
      where: { id: 'i1', status: InstallmentStatus.PAID, payment_intent_id: 'pi_ach' },
      data: expect.objectContaining({ status: InstallmentStatus.FAILED, amount: 2300, fee_amount: 300, refunded_amount: 0 }),
    });
    expect(mail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ amount: 2300 }));
  });

  it('a bank account is checked wherever a payment method is picked: never for card-only payments, only on large bookings', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ billing_id: 'cus_1' });
    (StripePayment.retrievePaymentMethod as jest.Mock).mockResolvedValue({ id: 'pm_bank', type: 'us_bank_account', customer: 'cus_1' });
    await expect(service.assertPaymentMethod('c1', 'pm_bank', null)).rejects.toThrow('This needs a card. Please choose a card.');
    await expect(service.assertPaymentMethod('c1', 'pm_bank', { total: 800 })).rejects.toThrow('Bank payments are for bookings of $5,000 or more. Please choose a card.');
    await expect(service.assertPaymentMethod('c1', 'pm_bank', { total: 6300, plan: PaymentPlan.DEPOSIT_50 })).resolves.toMatchObject({ type: 'us_bank_account' });
    (StripePayment.retrievePaymentMethod as jest.Mock).mockResolvedValue({ id: 'pm_card', type: 'card', customer: 'cus_1' });
    await expect(service.assertPaymentMethod('c1', 'pm_card', null)).resolves.toMatchObject({ type: 'card' });
  });

  it('a card attempt after a bank one records "card", so receipts and refunds read right', async () => {
    const { service, prisma } = setup();
    prisma.bookingInstallment.findUnique.mockResolvedValue(inst({ payment_method_type: 'us_bank_account', booking: { ...BANK_BOOKING, payment_method_id: 'pm_card', payment_method_type: null } }));
    prisma.bookingInstallment.findUniqueOrThrow.mockResolvedValue(inst({ status: InstallmentStatus.PAID }));
    (StripePayment.chargeSavedCard as jest.Mock).mockResolvedValue({ id: 'pi_c', status: 'succeeded' });
    await service.chargeInstallment('i1');
    expect(prisma.bookingInstallment.updateMany.mock.calls[0][0].data).toMatchObject({ status: InstallmentStatus.PROCESSING, payment_method_type: 'card' });
  });
});
