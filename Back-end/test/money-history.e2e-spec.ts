/**
 * Cancel preview, receipts, the final invoice, the transaction history, the deposit rules (12 hours to pay,
 * non-refundable deposit, cancellation reasons) and vendor cancellation tracking against a real Postgres + Redis.
 * Runs only when CONTRACTS_E2E_DATABASE_URL points at a migrated, disposable database:
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... yarn test:e2e money-history
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;
const SECRET = 'money-e2e-secret';

if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_money_e2e';
  process.env.APP_URL = 'http://money.test';
  process.env.CLIENT_APP_URL = 'http://localhost:3000';
  process.env.PRIVATE_STORAGE_DIR = `/tmp/money-e2e-${process.pid}`;
}

jest.setTimeout(240_000);
const DAY = 86400e3;

run('Money history, cancel preview and invoices (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  const id = randomBytes(4).toString('hex');
  const U = { vendor: `mv-${id}`, cust: `mc-${id}`, admin: `ma-${id}`, stranger: `ms-${id}`, flaky: `mf-${id}`, rival: `mr-${id}` };
  const types: Record<string, string> = { vendor: 'VENDOR', cust: 'CUSTOMER', admin: 'ADMIN', stranger: 'CUSTOMER', flaky: 'VENDOR', rival: 'VENDOR' };
  const T = Object.fromEntries(Object.entries(U).map(([k, sub]) => [k, jwt.sign({ sub, email: `${sub}@t.test`, type: types[k] }, SECRET)])) as Record<keyof typeof U, string>;
  const B = { done: `bd-${id}`, plan: `bp-${id}`, due: `bu-${id}`, bal: `bb-${id}`, f1: `bf1-${id}`, f2: `bf2-${id}` };
  // the deposit rules and vendor cancellation tracking (docs/PAYMENTS.md)
  const L: Record<string, string> = {};
  let categoryId = '';
  const http = () => request(app.getHttpServer());
  const as = (who: keyof typeof U, r: request.Test) => r.auth(T[who], { type: 'bearer' });

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module');
    const { PrismaService } = await import('../src/prisma/prisma.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.user.createMany({ data: Object.entries(U).map(([k, uid]) => ({ id: uid, email: `${uid}@t.test`, name: `${k} user`, type: types[k] })) });
    await prisma.vendorProfile.create({ data: { user_id: U.vendor, business_name: 'Mo Photos', address: '1 Lens Way' } });
    const listing = await prisma.vendorListing.create({ data: { vendor_id: U.vendor, title: `Wedding film ${id}`, description: 'x', price: 1000, status: 'ACTIVE' } });
    const now = Date.now();

    // completed and paid out: deposit + balance, $50 refunded on the balance, an approved add-on
    await prisma.booking.create({
      data: {
        id: B.done, customer_id: U.cust, vendor_id: U.vendor, listing_id: listing.id, status: 'COMPLETED', amount: 1000, service_fee: 50, currency: 'usd',
        paid_at: new Date(now - 40 * DAY), completed_at: new Date(now - 10 * DAY), released_at: new Date(now - 7 * DAY), payout_credited_at: new Date(now - 7 * DAY),
        commission_amount: 95, released_gross: 950, transfer_id: `tr_${id}`, event_start_at: new Date(now - 10 * DAY), invoice_sent_at: new Date(now - 7 * DAY),
        installments: {
          create: [
            { sequence: 1, label: '50% deposit', amount: 550, fee_amount: 50, due_at: new Date(now - 40 * DAY), status: 'PAID', paid_at: new Date(now - 40 * DAY), payment_intent_id: 'pi_a', paid_out_at: new Date(now - 7 * DAY), receipt_sent_at: new Date(now - 40 * DAY) },
            { sequence: 2, label: 'Balance', amount: 500, fee_amount: 0, refunded_amount: 50, due_at: new Date(now - 17 * DAY), status: 'PAID', paid_at: new Date(now - 17 * DAY), payment_intent_id: 'pi_b', paid_out_at: new Date(now - 7 * DAY), receipt_sent_at: new Date(now - 17 * DAY) },
          ],
        },
        extras: { create: [{ kind: 'ADD_ON', name: 'Drone shots', unit_price: 200, amount: 200, status: 'INCLUDED' }] },
      },
    });
    await prisma.paymentTransaction.createMany({
      data: [
        { user_id: U.vendor, type: 'booking_payout', provider: 'stripe', reference_number: `tr_${id}`, status: 'succeeded', amount: 855, currency: 'usd' },
        { user_id: U.vendor, type: 'vendly_commission', provider: 'stripe', reference_number: B.done, order_id: B.done, status: 'succeeded', amount: 95, currency: 'usd' },
      ],
    });

    // a payment plan: 25% deposit paid ($250 + $50 fee), $750 balance scheduled, event in 20 days
    await prisma.booking.create({
      data: {
        id: B.plan, customer_id: U.cust, vendor_id: U.vendor, listing_id: listing.id, status: 'CONFIRMED', amount: 1000, service_fee: 50, currency: 'usd', payment_plan: 'DEPOSIT_25',
        paid_at: new Date(now - DAY), event_start_at: new Date(now + 20 * DAY),
        installments: {
          create: [
            { sequence: 1, label: '25% deposit', amount: 300, fee_amount: 50, due_at: new Date(now - DAY), status: 'PAID', paid_at: new Date(now - DAY), payment_intent_id: 'pi_c' },
            { sequence: 2, label: 'Balance', amount: 750, fee_amount: 0, due_at: new Date(now + 6 * DAY), status: 'SCHEDULED' },
          ],
        },
      },
    });
  });

  beforeAll(async () => {
    const now = Date.now();
    const listing = await prisma.vendorListing.findFirst({ where: { vendor_id: U.vendor } });
    // deposit rules: a 50% deposit about to be charged with no saved card on file (it fails and waits for the customer)
    await prisma.booking.create({
      data: {
        id: B.due, customer_id: U.cust, vendor_id: U.vendor, listing_id: listing.id, status: 'CONFIRMED', amount: 800, service_fee: 40, currency: 'usd', payment_plan: 'DEPOSIT_50',
        event_start_at: new Date(now + 30 * DAY),
        installments: {
          create: [
            { sequence: 1, label: '50% deposit', amount: 440, fee_amount: 40, due_at: new Date(now - 60_000), status: 'SCHEDULED' },
            { sequence: 2, label: 'Balance', amount: 400, fee_amount: 0, due_at: new Date(now + 23 * DAY), status: 'SCHEDULED' },
          ],
        },
      },
    });
    // a 25% deposit paid ($250 + $50 fee) and the $750 balance failed: pending balance (deadline kept clear of the job runs below)
    await prisma.booking.create({
      data: {
        id: B.bal, customer_id: U.cust, vendor_id: U.vendor, listing_id: listing.id, status: 'CONFIRMED', amount: 1000, service_fee: 50, currency: 'usd', payment_plan: 'DEPOSIT_25',
        paid_at: new Date(now - 5 * DAY), event_start_at: new Date(now + 10 * DAY), payment_due_by: new Date(now + 2 * DAY), payment_due_kind: 'balance',
        installments: {
          create: [
            { sequence: 1, label: '25% deposit', amount: 300, fee_amount: 50, due_at: new Date(now - 5 * DAY), status: 'PAID', paid_at: new Date(now - 5 * DAY), payment_intent_id: 'pi_d2' },
            { sequence: 2, label: 'Balance', amount: 750, fee_amount: 0, due_at: new Date(now - 60_000), status: 'FAILED', attempts: 2, last_error: 'Your card was declined.' },
          ],
        },
      },
    });

    // a vendor who cancels twice, and another vendor in the same category free on the date
    const cat = await prisma.serviceCategory.create({ data: { name: `Film ${id}` } });
    categoryId = cat.id;
    await prisma.vendorProfile.createMany({ data: [{ user_id: U.rival, business_name: 'Rival Films' }, { user_id: U.flaky, business_name: 'Flaky Films' }] });
    L.rival = (await prisma.vendorListing.create({ data: { vendor_id: U.rival, category_id: cat.id, title: `Rival film ${id}`, description: 'x', price: 900, status: 'ACTIVE' } })).id;
    L.flaky = (await prisma.vendorListing.create({ data: { vendor_id: U.flaky, category_id: cat.id, title: `Flaky film ${id}`, description: 'x', price: 700, status: 'ACTIVE' } })).id;
    for (const bid of [B.f1, B.f2]) {
      await prisma.booking.create({ data: { id: bid, customer_id: U.cust, vendor_id: U.flaky, listing_id: L.flaky, status: 'CONFIRMED', amount: 700, service_fee: 35, currency: 'usd', event_start_at: new Date(now + 25 * DAY) } });
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  it('customers see their charges and refunds, filtered and searched', async () => {
    const all = await as('cust', http().get('/api/payments/transactions'));
    expect(all.status).toBe(200);
    // the deposit-rules bookings below add a paid deposit and a failed balance
    expect(all.body.meta).toMatchObject({ role: 'customer', total: 6 });
    const rows = all.body.data.map((r: any) => [r.description, r.type, r.amount]);
    expect(rows).toEqual(expect.arrayContaining([['25% deposit', 'payment', -300], ['50% deposit', 'payment', -550], ['Balance', 'payment', -500], ['Refund: Balance', 'refund', 50]]));
    const refunds = await as('cust', http().get('/api/payments/transactions?type=refund'));
    expect(refunds.body.data).toHaveLength(1);
    const none = await as('cust', http().get('/api/payments/transactions?q=nothing-like-this'));
    expect(none.body.data).toEqual([]);
    const bad = await as('cust', http().get('/api/payments/transactions?type=bogus'));
    expect(bad.status).toBe(400);
  });

  it('vendors see payments received, payouts (older rows linked by transfer) and commission', async () => {
    const res = await as('vendor', http().get('/api/payments/transactions'));
    expect(res.status).toBe(200);
    expect(res.body.meta.role).toBe('vendor');
    const byDesc = Object.fromEntries(res.body.data.map((r: any) => [`${r.type}:${r.description}`, r]));
    expect(byDesc['payout:Paid to your bank account']).toMatchObject({ amount: 855, booking_id: B.done });
    expect(byDesc['fee:Vendly commission']).toMatchObject({ amount: -95 });
    expect(byDesc['payment:25% deposit from cust user']).toMatchObject({ amount: 250, status: 'pending' });
    const payouts = await as('vendor', http().get('/api/payments/transactions?type=payout'));
    expect(payouts.body.data.every((r: any) => r.type === 'payout')).toBe(true);
  });

  it('the cancel preview says what cancelling does, and cancelling does exactly that', async () => {
    const preview = await as('vendor', http().get(`/api/bookings/${B.plan}/cancel-preview`));
    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({ cancelled_by: 'VENDOR', refund_total: 300, refund_fee: 50, vendor_keeps: 0, unpaid_cancelled: 750 });
    expect(preview.body.data.message).toContain('The customer gets $300.00 back, Vendly Protection fee included.');
    const forCustomer = await as('cust', http().get(`/api/bookings/${B.plan}/cancel-preview`));
    // moderate policy (no signed contract), 20 days out: 50% of the price, but only $250 was paid towards it
    expect(forCustomer.body.data).toMatchObject({ cancelled_by: 'CUSTOMER', percent: 50, refund_total: 0, vendor_keeps: 250, fee_kept: 50 });
    expect((await as('stranger', http().get(`/api/bookings/${B.plan}/cancel-preview`))).status).toBe(403);

    const cancelled = await as('vendor', http().patch(`/api/bookings/${B.plan}/cancel`).send({ reason: 'Double booked' }));
    expect(cancelled.status).toBe(200);
    const { message: _a, reasons: _r, ...previewNumbers } = preview.body.data;
    const { message: _b, ...doneNumbers } = cancelled.body.data.refund_summary;
    // the test Stripe key can't refund: the result says so (Vendly follows up) instead of promising the money
    expect(doneNumbers).toEqual({ ...previewNumbers, refund_total: 0, refund_failed: 300, refund_timing: null });
    expect(cancelled.body.data.refund_summary.message).toContain("A refund of $300.00 to the customer didn't go through straight away");
    const b = await prisma.booking.findUnique({ where: { id: B.plan }, include: { installments: { orderBy: { sequence: 'asc' } } } });
    expect(b.status).toBe('CANCELLED');
    expect(b.installments[1].status).toBe('CANCELLED');
    // what didn't go back is recorded for follow-up
    const failed = await prisma.paymentTransaction.findFirst({ where: { order_id: B.plan, type: 'booking_refund', status: 'refund_failed' } });
    expect(Number(failed.amount)).toBe(300);
    // the money is settled: the invoice email is claimed once
    expect(b.invoice_sent_at).not.toBeNull();
  });

  it('serves the final invoice PDF to the customer, the vendor and admins only, and through a short-lived link', async () => {
    const pdf = await as('cust', http().get(`/api/bookings/${B.done}/invoice`)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect((await as('vendor', http().get(`/api/bookings/${B.done}/invoice`))).status).toBe(200);
    expect((await as('admin', http().get(`/api/bookings/${B.done}/invoice`))).status).toBe(200);
    expect((await as('stranger', http().get(`/api/bookings/${B.done}/invoice`))).status).toBe(403);

    const link = await as('cust', http().get(`/api/bookings/${B.done}/invoice/link`));
    expect(link.status).toBe(200);
    const path = new URL(link.body.data.url).pathname;
    const file = await http().get(path);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect((await http().get(`${path}x`)).status).toBe(403);
  });

  it('the payments timeline reports the refund and that the invoice is ready', async () => {
    const res = await as('cust', http().get(`/api/bookings/${B.done}/payments`));
    expect(res.body.data).toMatchObject({ refunded: 50, refund_timing: '5–10 business days', invoice_available: true });
  });

  it('a receipt is claimed once per paid installment, and the hourly sweep finds missed ones', async () => {
    const { PaymentsService } = await import('../src/modules/payments/payments.service');
    const payments = app.get(PaymentsService);
    const inst = await prisma.bookingInstallment.create({
      data: { booking_id: B.done, sequence: 3, label: 'Add-on: Second shooter', kind: 'extra', amount: 157.5, fee_amount: 7.5, due_at: new Date(), status: 'PAID', paid_at: new Date(), payment_intent_id: 'pi_x' },
    });
    const swept = await payments.runReceiptSweep();
    expect(swept.receipts).toBeGreaterThanOrEqual(1);
    const after = await prisma.bookingInstallment.findUnique({ where: { id: inst.id } });
    expect(after.receipt_sent_at).not.toBeNull();
    expect(await payments.sendReceipt(inst.id)).toBe(false);
  });

  it('deposit plans: a failed deposit is pending for 12 hours, the customer is reminded, then it is cancelled for non-payment', async () => {
    const { PaymentsService } = await import('../src/modules/payments/payments.service');
    const { PaymentDeadlinesService } = await import('../src/modules/booking/payment-deadlines.service');
    const payments = app.get(PaymentsService);
    const deadlines = app.get(PaymentDeadlinesService);
    const inst = await prisma.bookingInstallment.findFirst({ where: { booking_id: B.due, sequence: 1 } });

    // no saved card: it can't be retried without the customer
    await payments.chargeInstallment(inst.id);
    let b = await prisma.booking.findUnique({ where: { id: B.due }, include: { installments: { orderBy: { sequence: 'asc' } } } });
    expect(b.installments[0]).toMatchObject({ status: 'FAILED', next_attempt_at: null });
    expect(b.payment_due_kind).toBe('deposit');
    expect(b.payment_due_by.getTime() - Date.now()).toBeGreaterThan(11.9 * 3600e3);
    const dueBy: Date = b.payment_due_by;

    const one = await as('cust', http().get(`/api/bookings/${B.due}`));
    expect(one.body.data).toMatchObject({ status: 'CONFIRMED', payment_state: 'pending_deposit', payment_state_label: 'Pending deposit' });
    const listed = await as('vendor', http().get('/api/bookings/my/vendor?limit=50'));
    expect(listed.body.data.find((x: any) => x.id === B.due)).toMatchObject({ payment_state: 'pending_deposit' });
    expect((await as('cust', http().get(`/api/bookings/${B.due}/payments`))).body.data).toMatchObject({ payment_state: 'pending_deposit' });

    // about 2 hours left: one reminder, never two
    expect((await deadlines.run(new Date(dueBy.getTime() - 90 * 60e3))).cancelled).toBe(0);
    b = await prisma.booking.findUnique({ where: { id: B.due } });
    expect(b.payment_due_reminded_at).not.toBeNull();
    const reminded = b.payment_due_reminded_at.getTime();
    await deadlines.run(new Date(dueBy.getTime() - 60 * 60e3));
    expect((await prisma.booking.findUnique({ where: { id: B.due } })).payment_due_reminded_at.getTime()).toBe(reminded);

    // the deadline passes: cancelled for non-payment, by the system, once
    const after = new Date(dueBy.getTime() + 60e3);
    expect((await deadlines.run(after)).cancelled).toBeGreaterThanOrEqual(1);
    b = await prisma.booking.findUnique({ where: { id: B.due }, include: { installments: true } });
    expect(b).toMatchObject({ status: 'CANCELLED', cancelled_by: 'SYSTEM', cancel_reason_code: 'non_payment', payment_due_by: null });
    expect(b.installments.every((i: any) => i.status === 'CANCELLED')).toBe(true);
    await deadlines.run(new Date(after.getTime() + 3600e3));
    expect((await prisma.booking.findUnique({ where: { id: B.due } })).cancelled_at.getTime()).toBe(b.cancelled_at.getTime());
    const shown = await as('cust', http().get(`/api/bookings/${B.due}`));
    expect(shown.body.data).toMatchObject({ payment_state: null, cancel_reason_label: 'Payment not made in time' });
  });

  it('the vendor cancels a pending balance for non-payment: settled like the customer’s, the deposit stays with the vendor', async () => {
    expect((await as('cust', http().patch(`/api/bookings/${B.bal}/cancel`).send({ reason_code: 'bogus' }))).status).toBe(400);
    expect((await as('cust', http().patch(`/api/bookings/${B.bal}/cancel`).send({ reason_code: 'double_booked' }))).status).toBe(400);

    const custPreview = await as('cust', http().get(`/api/bookings/${B.bal}/cancel-preview`));
    expect(custPreview.body.data.message).toContain('Your deposit of $250.00 is non-refundable.');
    expect(custPreview.body.data.reasons.map((r: any) => r.key)).toEqual(['plans_changed', 'found_another_vendor', 'event_cancelled', 'price', 'other']);
    const preview = await as('vendor', http().get(`/api/bookings/${B.bal}/cancel-preview?reason_code=customer_didnt_pay`));
    expect(preview.body.data).toMatchObject({ cancelled_by: 'CUSTOMER', refund_total: 0, vendor_keeps: 250, deposit_kept: 250, unpaid_cancelled: 750 });
    expect(preview.body.data.reasons[0]).toEqual({ key: 'customer_didnt_pay', label: 'Customer didn’t pay' });

    const balanceBefore = Number((await prisma.user.findUnique({ where: { id: U.vendor } })).balance ?? 0);
    const res = await as('vendor', http().patch(`/api/bookings/${B.bal}/cancel`).send({ reason_code: 'customer_didnt_pay', note: 'Tried twice' }));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'CANCELLED', cancelled_by: 'VENDOR', cancel_reason_code: 'customer_didnt_pay', cancel_reason: 'Tried twice', cancel_reason_label: 'Customer didn’t pay' });
    expect(res.body.data.refund).toMatchObject({ refundTotal: 0, vendorKeeps: 250 });
    expect(Number((await prisma.user.findUnique({ where: { id: U.vendor } })).balance)).toBe(balanceBefore + 250);
    const earning = await prisma.paymentTransaction.findFirst({ where: { order_id: B.bal, type: 'booking_cancellation_earning' } });
    expect(Number(earning.amount)).toBe(250);

    // the customer sees why; no other vendors are pushed on a non-payment cancellation
    const shown = await as('cust', http().get(`/api/bookings/${B.bal}`));
    expect(shown.body.data).toMatchObject({ cancel_reason_label: 'Customer didn’t pay', cancel_reason: 'Tried twice' });
    expect(shown.body.data.similar_vendors).toBeUndefined();
    // and so does the invoice
    const { InvoiceService } = await import('../src/modules/payments/invoice.service');
    const inv = await app.get(InvoiceService).invoiceFor(B.bal, { id: U.cust });
    expect(inv.cancellation).toEqual({ by: 'The vendor', reason: 'Customer didn’t pay. Tried twice' });
    // not counted against the vendor
    expect((await prisma.user.findUnique({ where: { id: U.vendor } })).cancellations_alerted_at).toBeNull();
  });

  it('a vendor’s second own cancellation in 90 days: admins told once, packages shown last, customers offered vendors free that day', async () => {
    const { MarketplaceService } = await import('../src/modules/marketplace/marketplace.service');
    const search = async () => (await http().get(`/api/marketplace/listings?q=${id}&category_id=${categoryId}`)).body.data.map((l: any) => l.id);
    // newest first
    expect(await search()).toEqual([L.flaky, L.rival]);

    const first = await as('flaky', http().patch(`/api/bookings/${B.f1}/cancel`).send({ reason_code: 'emergency' }));
    expect(first.status).toBe(200);
    expect(first.body.data.similar_vendors.items.map((v: any) => v.id)).toEqual([L.rival]);
    expect(first.body.data.similar_vendors.url).toContain(`/marketplace?category_id=${categoryId}&date=`);
    expect((await prisma.user.findUnique({ where: { id: U.flaky } })).cancellations_alerted_at).toBeNull();

    await as('flaky', http().patch(`/api/bookings/${B.f2}/cancel`).send({ reason_code: 'double_booked', note: 'Took another job' }));
    const alerted = (await prisma.user.findUnique({ where: { id: U.flaky } })).cancellations_alerted_at;
    expect(alerted).not.toBeNull();

    const vendors = await as('admin', http().get('/api/admin/user/vendors?limit=200'));
    expect(vendors.body.data.find((v: any) => v.id === U.flaky)).toMatchObject({ cancellations_90d: 2, ranked_lower: true });
    expect(vendors.body.data.find((v: any) => v.id === U.rival)).toMatchObject({ cancellations_90d: 0, ranked_lower: false });

    // search reads the list of vendors shown last every few minutes: start this check fresh
    (app.get(MarketplaceService) as any).penalised = null;
    expect(await search()).toEqual([L.rival, L.flaky]);

    const seen = await as('cust', http().get(`/api/bookings/${B.f1}`));
    expect(seen.body.data).toMatchObject({ cancelled_by: 'VENDOR', cancel_reason_label: 'Emergency / can’t make it' });
    expect(seen.body.data.similar_vendors.items[0]).toMatchObject({ id: L.rival, vendor_name: 'Rival Films' });
  });
});
