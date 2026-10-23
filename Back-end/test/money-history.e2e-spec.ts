/**
 * Cancel preview, receipts, the final invoice and the transaction history against a real Postgres + Redis.
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
  const U = { vendor: `mv-${id}`, cust: `mc-${id}`, admin: `ma-${id}`, stranger: `ms-${id}` };
  const types: Record<string, string> = { vendor: 'VENDOR', cust: 'CUSTOMER', admin: 'ADMIN', stranger: 'CUSTOMER' };
  const T = Object.fromEntries(Object.entries(U).map(([k, sub]) => [k, jwt.sign({ sub, email: `${sub}@t.test`, type: types[k] }, SECRET)])) as Record<keyof typeof U, string>;
  const B = { done: `bd-${id}`, plan: `bp-${id}` };
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

  afterAll(async () => {
    await app?.close();
  });

  it('customers see their charges and refunds, filtered and searched', async () => {
    const all = await as('cust', http().get('/api/payments/transactions'));
    expect(all.status).toBe(200);
    expect(all.body.meta).toMatchObject({ role: 'customer', total: 4 });
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
    const { message: _a, ...previewNumbers } = preview.body.data;
    const { message: _b, ...doneNumbers } = cancelled.body.data.refund_summary;
    expect(doneNumbers).toEqual(previewNumbers);
    const b = await prisma.booking.findUnique({ where: { id: B.plan }, include: { installments: { orderBy: { sequence: 'asc' } } } });
    expect(b.status).toBe('CANCELLED');
    expect(b.installments[1].status).toBe('CANCELLED');
    // the money is settled (the test Stripe key can't refund, which is recorded for follow-up): the invoice email is claimed once
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
});
