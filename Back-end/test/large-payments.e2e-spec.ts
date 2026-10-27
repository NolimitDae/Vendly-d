/**
 * Large bookings against a real Postgres + Redis: the Vendly Protection fee capped at $500 (a category
 * charging 10%), a $6,000 booking paid from a bank account (ACH): the deposit shows Processing, the
 * vendor can't take it early until it clears, then can; a failing bank balance payment opens the
 * 48-hour window to pay another way, and the booking isn't cancelled while a bank payment is on its
 * way; a dispute on a $150,500 booking can ask for more than $100,000, never more than was paid.
 * Stripe is mocked (bank charges come back "processing"; webhooks are fed to the reconcile handler).
 * Runs only when CONTRACTS_E2E_DATABASE_URL points at a migrated, disposable database:
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... yarn test:e2e large-payments
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;
const SECRET = 'large-e2e-secret';

if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_large_e2e';
  process.env.APP_URL = 'http://large.test';
  process.env.CLIENT_APP_URL = 'http://localhost:3000';
  process.env.PRIVATE_STORAGE_DIR = `/tmp/large-e2e-${process.pid}`;
}

jest.setTimeout(240_000);

// a drawn signature (64x32 PNG) is required to sign
const SIGNATURE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAiElEQVR42u2XWwrAMAgEc/9L2xOEYh67G5iBfFbHVMSMAQAAAHCfmhy3k61w9yVIclfjuLpRVrxVxpGvk0QlFVm8Ui62eIXgNHaFtdjpTviNdypZvRor/a9JvHaS3Rxe0nmyUkjq5F726nyoXGCkO0X69ibxSt/fJV7JLziZV+IbPtkLAADgJT6abb9BSgfpowAAAABJRU5ErkJggg==';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = 86400e3;
const HOUR = 3600e3;

run('Large bookings: fee cap, bank payments and the 48-hour window (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  let payments: any;
  const id = randomBytes(4).toString('hex');
  const U = { vendor: `lv-${id}`, cust: `lc-${id}`, admin: `la-${id}` };
  const types: Record<string, string> = { vendor: 'VENDOR', cust: 'CUSTOMER', admin: 'ADMIN' };
  const T = Object.fromEntries(Object.entries(U).map(([k, sub]) => [k, jwt.sign({ sub, email: `${sub}@t.test`, type: types[k] }, SECRET)])) as Record<keyof typeof U, string>;
  const L = { gala: `lg-${id}`, small: `ls-${id}` };
  const CUS = `cus_${U.cust}`;

  const start = new Date(Date.now() + 40 * DAY);
  start.setUTCHours(18, 0, 0, 0);
  const end = new Date(start.getTime() + 5 * HOUR);
  const fields = (listing: string) => ({ listing_id: listing, vendor_id: U.vendor, timezone: 'America/New_York', event_start_at: start, event_end_at: end, venue_address: '5 Park Ave, New York NY', guest_count: 120 });
  const sig = (name: string, hash: string) => ({ legal_name: name, consent: true, content_sha256: hash, device_platform: 'web', signature_image: SIGNATURE_PNG });
  const http = () => request(app.getHttpServer());
  const as = (who: keyof typeof U, r: request.Test) => r.auth(T[who], { type: 'bearer' });
  const msg = (res: request.Response) => res.body?.message?.message ?? res.body?.message;

  const charges: { amount: number; bank: boolean; pi: string; installment: string }[] = [];
  const transfers: { amount: number; key: string }[] = [];
  const refunds: { pi: string; amount?: number }[] = [];

  beforeAll(async () => {
    const { StripePayment } = await import('../src/common/lib/Payment/stripe/StripePayment');
    let n = 0;
    jest.spyOn(StripePayment, 'chargeSavedCard').mockImplementation(async (o: any) => {
      const pi = `pi_lg_${id}_${++n}`;
      charges.push({ amount: o.amount, bank: !!o.bank, pi, installment: o.installmentId });
      // bank payments take days: Stripe answers "processing"
      return { id: pi, status: o.bank ? 'processing' : 'succeeded' } as any;
    });
    jest.spyOn(StripePayment, 'retrievePaymentMethod').mockImplementation(async (pm: string) =>
      (pm.startsWith('pm_bank')
        ? { id: pm, type: 'us_bank_account', customer: CUS, us_bank_account: { bank_name: 'STRIPE TEST BANK', last4: '6789' } }
        : { id: pm, type: 'card', customer: CUS, card: { brand: 'visa', last4: '4242' } }) as any,
    );
    jest.spyOn(StripePayment, 'transferForBooking').mockImplementation(async (o: any) => {
      transfers.push({ amount: o.amount, key: o.idempotencyKey });
      return { id: `tr_${transfers.length}` } as any;
    });
    jest.spyOn(StripePayment, 'refundPaymentIntent').mockImplementation(async (pi: string, _key: string, amount?: number) => {
      refunds.push({ pi, amount });
      return { id: `re_${refunds.length}`, status: 'pending' } as any;
    });

    const { AppModule } = await import('../src/app.module');
    const { PrismaService } = await import('../src/prisma/prisma.service');
    const { PaymentsService } = await import('../src/modules/payments/payments.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
    prisma = app.get(PrismaService);
    payments = app.get(PaymentsService);

    await prisma.user.createMany({
      data: Object.entries(U).map(([k, uid]) => ({ id: uid, email: `${uid}@t.test`, name: `${k} user`, type: types[k], ...(k === 'cust' ? { billing_id: CUS } : {}), ...(k === 'vendor' ? { stripe_connect_id: `acct_${id}` } : {}) })),
    });
    await prisma.vendorProfile.create({ data: { user_id: U.vendor, business_name: 'Grand Events', address: '1 Main St' } });
    // a category charging 10%: on $6,000 that would be $600, capped at $500
    const cat = await prisma.serviceCategory.create({ data: { name: `Galas ${id}`, fee_percent: 10 } });
    await prisma.vendorListing.createMany({
      data: [
        { id: L.gala, vendor_id: U.vendor, category_id: cat.id, title: 'Gala dinner', description: 'Dinner for 120', price: 6000, payment_plan: 'DEPOSIT_50', status: 'ACTIVE' },
        { id: L.small, vendor_id: U.vendor, title: 'Cocktail hour', description: 'Drinks', price: 900, payment_plan: 'DEPOSIT_50', status: 'ACTIVE' },
      ],
    });
    const { PlatformSettingsService } = await import('../src/modules/platform/platform-settings.service');
    await app.get(PlatformSettingsService).refresh();
    const contract = await as('vendor', http().post('/api/vendor/contracts/default')).send({
      category: 'PHOTO_VIDEO',
      field_values: { business_legal_name: 'Grand Events LLC', business_address: '1 Main St', cancellation_policy: 'moderate', governing_law: 'New York, USA', delivery_time_days: '1', revisions_included: '0', usage_rights: 'personal' },
    });
    expect(contract.status).toBe(201);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  let bookingId = '';

  it('the fee is capped at $500, the booking is large, and the contract gives large bookings 48 hours', async () => {
    const settings = await http().get('/api/payment-settings');
    expect(settings.body.data).toMatchObject({ fee_maximum: 500, large_payment_threshold: 5000, payment_due_hours: 12, large_payment_due_hours: 48 });

    const pv = await as('cust', http().post('/api/contracts/booking-preview')).send({ ...fields(L.gala), payment_method_id: 'pm_bank_1' });
    expect(pv.status).toBe(201);
    expect(pv.body.data.pricing).toMatchObject({ price: 6000, service_fee: 500, total: 6500, fee_maximum: 500, large: true, bank_allowed: true, payment_due_hours: 48 });
    expect(pv.body.data.body).toContain("wasn't made within 12 hours of failing (48 hours on bookings of $5,000 or more).");
    expect(pv.body.data.body).toContain('Vendly Protection fee: $500.00');

    // a bank account can't pay for a booking under $5,000
    const small = await as('cust', http().post('/api/contracts/booking-preview')).send({ ...fields(L.small), payment_method_id: 'pm_bank_1' });
    expect(small.body.data.pricing).toMatchObject({ large: false, bank_allowed: false, payment_due_hours: 12 });
    await sleep(2100);
    const refused = await as('cust', http().post('/api/bookings')).send({ ...fields(L.small), payment_method_id: 'pm_bank_1', preview_token: small.body.data.preview_token, signature: sig('Cara Customer', small.body.data.content_sha256) });
    expect(refused.status).toBe(400);
    expect(msg(refused)).toBe('Bank payments are for bookings of $5,000 or more. Please choose a card.');

    const created = await as('cust', http().post('/api/bookings')).send({ ...fields(L.gala), payment_method_id: 'pm_bank_1', preview_token: pv.body.data.preview_token, signature: sig('Cara Customer', pv.body.data.content_sha256) });
    expect(created.status).toBe(201);
    bookingId = created.body.data.id;
    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(Number(b.service_fee)).toBe(500);
    expect(b.payment_method_type).toBe('us_bank_account');
  });

  it('accepted as usual; the bank deposit shows Processing and the vendor can’t take it early yet', async () => {
    const contracts = await as('vendor', http().get(`/api/contracts/booking/${bookingId}`));
    const current = contracts.body.data.contracts.find((c: any) => c.id === contracts.body.data.current_id);
    await sleep(1100);
    const res = await as('vendor', http().patch(`/api/bookings/${bookingId}/confirm`)).send({ signature: sig('Vic Vendor', current.content_sha256) });
    expect(res.status).toBe(200);

    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(b.status).toBe('CONFIRMED');
    expect(b.paid_at).toBeNull();
    // the deposit: 50% of $6,000 plus the whole $500 fee, from the bank account
    expect(charges.at(-1)).toMatchObject({ amount: 3500, bank: true });
    const t = await as('cust', http().get(`/api/bookings/${bookingId}/payments`));
    expect(t.status).toBe(200);
    expect(t.body.data).toMatchObject({ large: true, payment_due_hours: 48, paying_by_bank: true, processing: 3500, paid: 0, payment_state: null });
    expect(t.body.data.installments[0]).toMatchObject({ sequence: 1, status: 'PROCESSING', clearing: true, by_bank: true });
    expect(t.body.data.installments[1]).toMatchObject({ sequence: 2, status: 'SCHEDULED', amount: 3000 });

    // the customer's history shows it pending; the vendor's shows it on its way
    const custTx = await as('cust', http().get('/api/payments/transactions'));
    expect(custTx.body.data.find((r: any) => r.booking_id === bookingId)).toMatchObject({ status: 'pending', description: '50% deposit (bank payment processing)', amount: -3500 });
    const vendTx = await as('vendor', http().get('/api/payments/transactions'));
    expect(vendTx.body.data.find((r: any) => r.booking_id === bookingId)).toMatchObject({ status: 'pending', amount: 3000 });

    // nothing is paid out on money that may not arrive
    const early = await as('vendor', http().post(`/api/bookings/${bookingId}/release-deposit`));
    expect(early.status).toBe(400);
    expect(msg(early)).toMatch(/still clearing/);
    expect(transfers).toHaveLength(0);
    // and the customer can't pay it a second time meanwhile
    const deposit = t.body.data.installments[0];
    const twice = await as('cust', http().post(`/api/bookings/${bookingId}/installments/${deposit.id}/retry`)).send({});
    expect(twice.status).toBe(409);
  });

  it('once the bank payment clears, the deposit is paid and the vendor can take it', async () => {
    const deposit = await prisma.bookingInstallment.findFirst({ where: { booking_id: bookingId, sequence: 1 } });
    await payments.reconcilePaymentIntent({ id: deposit.payment_intent_id, status: 'succeeded', metadata: { installment_id: deposit.id } });
    const paid = await prisma.bookingInstallment.findUnique({ where: { id: deposit.id } });
    expect(paid.status).toBe('PAID');
    expect(paid.clearing_since).toBeNull();
    expect((await prisma.booking.findUnique({ where: { id: bookingId } })).paid_at).not.toBeNull();

    const early = await as('vendor', http().post(`/api/bookings/${bookingId}/release-deposit`));
    expect(early.status).toBe(201);
    expect(transfers).toEqual([{ amount: 3000, key: `early-${bookingId}` }]);
  });

  it('a failing bank balance payment opens the 48-hour window; a bank payment on its way is never cancelled for non-payment', async () => {
    // the balance falls due
    const balance = await prisma.bookingInstallment.findFirst({ where: { booking_id: bookingId, sequence: 2 } });
    await prisma.bookingInstallment.update({ where: { id: balance.id }, data: { due_at: new Date(Date.now() - 60_000) } });
    await payments.runDueCharges();
    expect(charges.at(-1)).toMatchObject({ amount: 3000, bank: true, installment: balance.id });
    const sent = await prisma.bookingInstallment.findUnique({ where: { id: balance.id } });
    expect(sent.status).toBe('PROCESSING');
    expect(sent.clearing_since).not.toBeNull();

    // the bank says no
    const before = Date.now();
    await payments.reconcilePaymentIntent({ id: sent.payment_intent_id, status: 'requires_payment_method', metadata: { installment_id: balance.id }, last_payment_error: { message: 'The account has insufficient funds.' } });
    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(b.status).toBe('CONFIRMED');
    expect(b.payment_due_kind).toBe('balance');
    expect(b.payment_due_by.getTime() - before).toBeGreaterThanOrEqual(48 * HOUR - 60_000);
    expect(b.payment_due_by.getTime() - Date.now()).toBeLessThanOrEqual(48 * HOUR);
    const failed = await prisma.bookingInstallment.findUnique({ where: { id: balance.id } });
    expect(failed.status).toBe('FAILED');
    expect(failed.next_attempt_at).toBeNull();
    const t = await as('cust', http().get(`/api/bookings/${bookingId}/payments`));
    expect(t.body.data).toMatchObject({ payment_state: 'pending_balance', payment_due_hours: 48 });

    // the customer pays from the bank again; the deadline passes while it clears: nothing is cancelled
    const retry = await as('cust', http().post(`/api/bookings/${bookingId}/installments/${balance.id}/retry`)).send({ payment_method_id: 'pm_bank_1' });
    expect(retry.status).toBe(201);
    const again = await prisma.bookingInstallment.findUnique({ where: { id: balance.id } });
    expect(again.status).toBe('PROCESSING');
    expect(again.clearing_since).not.toBeNull();
    await prisma.booking.update({ where: { id: bookingId }, data: { payment_due_by: new Date(Date.now() - 60_000) } });
    const { PaymentDeadlinesService } = await import('../src/modules/booking/payment-deadlines.service');
    await app.get(PaymentDeadlinesService).run();
    expect((await prisma.booking.findUnique({ where: { id: bookingId } })).status).toBe('CONFIRMED');

    // it clears: the window closes
    await payments.reconcilePaymentIntent({ id: again.payment_intent_id, status: 'succeeded', metadata: { installment_id: balance.id } });
    const done = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(done.payment_due_by).toBeNull();
    expect((await prisma.bookingInstallment.findUnique({ where: { id: balance.id } })).status).toBe('PAID');
  });

  it('the payout waits for every bank payment to clear', async () => {
    // a completed booking with a bank payment still clearing (an add-on)
    const now = Date.now();
    await prisma.booking.update({ where: { id: bookingId }, data: { status: 'COMPLETED', completed_at: new Date(now - 4 * DAY), release_at: new Date(now - DAY) } });
    const extra = await prisma.bookingInstallment.create({
      data: { booking_id: bookingId, sequence: 3, label: 'Add-on: Late night', amount: 210, fee_amount: 10, due_at: new Date(now - DAY), kind: 'extra', status: 'PROCESSING', payment_intent_id: `pi_extra_${id}`, clearing_since: new Date(now - DAY), payment_method_type: 'us_bank_account', attempts: 1 },
    });
    await payments.runReleases();
    expect((await prisma.booking.findUnique({ where: { id: bookingId } })).released_at).toBeNull();
    expect(transfers).toHaveLength(1);

    await payments.reconcilePaymentIntent({ id: extra.payment_intent_id, status: 'succeeded', metadata: { installment_id: extra.id } });
    await payments.runReleases();
    const released = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(released.released_at).not.toBeNull();
    // $3,000 deposit + $3,000 balance + $200 add-on, less the $3,000 already paid out early
    expect(transfers.at(-1)).toEqual({ amount: 3200, key: `release-${bookingId}` });
  });

  it('a dispute on a large booking can ask for more than $100,000, never more than was paid', async () => {
    const big = `lb-${id}`;
    const now = Date.now();
    await prisma.booking.create({
      data: {
        id: big, customer_id: U.cust, vendor_id: U.vendor, listing_id: L.gala, status: 'COMPLETED', amount: 150000, service_fee: 500, currency: 'usd', paid_at: new Date(now - 5 * DAY),
        completed_at: new Date(now - DAY), event_start_at: new Date(now - 2 * DAY), payment_plan: 'FULL_ON_ACCEPT', payment_method_id: 'pm_bank_1', payment_method_type: 'us_bank_account',
        installments: { create: [{ sequence: 1, label: 'Full payment', amount: 150500, fee_amount: 500, due_at: new Date(now - 5 * DAY), status: 'PAID', paid_at: new Date(now - 5 * DAY), payment_intent_id: `pi_big_${id}`, payment_method_type: 'us_bank_account' }] },
      },
    });
    const tooMuch = await as('cust', http().post(`/api/bookings/${big}/dispute`)).send({ reason: 'Half the guests had no dinner at all', outcome: 'partial_refund', requested_amount: 160000 });
    expect(tooMuch.status).toBe(400);
    expect(msg(tooMuch)).toBe('You can ask for up to $150,500.00, what you’ve paid for this booking.');
    const res = await as('cust', http().post(`/api/bookings/${big}/dispute`)).send({ reason: 'Half the guests had no dinner at all', outcome: 'partial_refund', requested_amount: 120000 });
    expect(res.status).toBe(201);
    expect(Number((await prisma.booking.findUnique({ where: { id: big } })).dispute_requested_amount)).toBe(120000);

    // Vendly refunds it; a bank refund is on its way for a few days
    const resolved = await as('admin', http().post(`/api/admin/disputes/${big}/resolve`)).send({ action: 'partial_refund', amount: 120000, note: 'Refunded the missing dinners' });
    expect(resolved.status).toBe(201);
    expect(refunds.at(-1)).toEqual({ pi: `pi_big_${id}`, amount: 120000 });
    const t = await as('cust', http().get(`/api/bookings/${big}/payments`));
    expect(t.body.data).toMatchObject({ refunded: 120000, refund_by_bank: true, refund_card: 'Bank account •••• 6789', refund_timing: 'about 5 business days' });
  });
});
