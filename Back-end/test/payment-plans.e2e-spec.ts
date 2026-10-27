/**
 * Custom payment plans against a real Postgres + Redis (payments/custom-plan.ts): a vendor suggests a
 * 3-part plan on a request, the customer approves it, the vendor accepts and the first part is charged;
 * the scheduler takes the second on its date and a failed third goes into the pending-payment window. On a
 * confirmed booking the vendor proposes a plan for what's left, which the customer declines or signs. A
 * customer who cancels after two payments keeps the first one with the vendor (the deposit) and gets the
 * rest back per the cancellation policy. Stripe is mocked.
 * Runs only when CONTRACTS_E2E_DATABASE_URL points at a migrated, disposable database:
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... yarn test:e2e payment-plans
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { signedIn } from './e2e-sessions';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;
const SECRET = 'plans-e2e-secret';

if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_plans_e2e';
  process.env.APP_URL = 'http://plans.test';
  process.env.CLIENT_APP_URL = 'http://localhost:3000';
  process.env.PRIVATE_STORAGE_DIR = `/tmp/plans-e2e-${process.pid}`;
}

jest.setTimeout(240_000);

// a drawn signature (64x32 PNG) is required to sign
const SIGNATURE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAiElEQVR42u2XWwrAMAgEc/9L2xOEYh67G5iBfFbHVMSMAQAAAHCfmhy3k61w9yVIclfjuLpRVrxVxpGvk0QlFVm8Ui62eIXgNHaFtdjpTviNdypZvRor/a9JvHaS3Rxe0nmyUkjq5F726nyoXGCkO0X69ibxSt/fJV7JLziZV+IbPtkLAADgJT6abb9BSgfpowAAAABJRU5ErkJggg==';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = 86400e3;
const HOUR = 3600e3;
const r2 = (n: number) => Math.round(n * 100) / 100;

run('Custom payment plans (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  let payments: any;
  const declined = new Set<string>();
  const id = randomBytes(4).toString('hex');
  const U = { vendor: `pv-${id}`, cust: `pc-${id}`, other: `po-${id}` };
  const types: Record<string, string> = { vendor: 'VENDOR', cust: 'CUSTOMER', other: 'CUSTOMER' };
  const T = Object.fromEntries(Object.entries(U).map(([k, sub]) => [k, jwt.sign({ sub, email: `${sub}@t.test`, type: types[k] }, SECRET)])) as Record<keyof typeof U, string>;
  const LISTING = `pl-${id}`;

  const sig = (name: string, hash: string, drawn = true) => ({ legal_name: name, consent: true, content_sha256: hash, device_platform: 'web', ...(drawn ? { signature_image: SIGNATURE_PNG } : {}) });
  const http = () => request(app.getHttpServer());
  const as = (who: keyof typeof U, r: request.Test) => r.auth(T[who], { type: 'bearer' });
  const msg = (res: request.Response) => res.body?.message?.message ?? res.body?.message;
  const charged: { amount: number; pi: string }[] = [];
  // this run's charge for a payment (the suites share a database, so the payment jobs may charge other suites' bookings in between)
  const chargeOf = (pi: string | null) => charged.find((c) => c.pi === pi);
  const refunds: { pi: string; amount: number }[] = [];
  const charges = (bid: string) => prisma.bookingInstallment.findMany({ where: { booking_id: bid, kind: 'charge' }, orderBy: { sequence: 'asc' } });

  beforeAll(async () => {
    const { StripePayment } = await import('../src/common/lib/Payment/stripe/StripePayment');
    let n = 0;
    jest.spyOn(StripePayment, 'chargeSavedCard').mockImplementation(async (o: any) => {
      // the scheduler also takes other bookings' due charges: only the chosen ones are declined
      if (declined.has(o.installmentId)) throw Object.assign(new Error('Your card was declined.'), { code: 'card_declined' });
      const pi = `pi_plan_${id}_${++n}`;
      charged.push({ amount: o.amount, pi });
      return { id: pi, status: 'succeeded' } as any;
    });
    jest.spyOn(StripePayment, 'refundPaymentIntent').mockImplementation(async (pi: string, _key: string, amount?: number) => {
      refunds.push({ pi, amount: Number(amount) });
      return { id: `re_${refunds.length}`, status: 'succeeded' } as any;
    });
    jest.spyOn(StripePayment, 'retrievePaymentMethod').mockResolvedValue({ card: { brand: 'visa', last4: '4242' } } as any);

    const { AppModule } = await import('../src/app.module');
    const { PrismaService } = await import('../src/prisma/prisma.service');
    const { PaymentsService } = await import('../src/modules/payments/payments.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
    await signedIn(app, Object.values(U));
    prisma = app.get(PrismaService);
    payments = app.get(PaymentsService);

    await prisma.user.createMany({
      data: Object.entries(U).map(([k, uid]) => ({ id: uid, email: `${uid}@t.test`, name: `${k} user`, type: types[k], ...(k !== 'vendor' ? { billing_id: `cus_${uid}` } : {}) })),
    });
    await prisma.vendorProfile.create({ data: { user_id: U.vendor, business_name: 'Gala Caterers', address: '1 Main St' } });
    // $40 a guest, 100 guests: $4,000, paid with a 50% deposit
    await prisma.vendorListing.create({
      data: { id: LISTING, vendor_id: U.vendor, title: 'Gala dinner', description: 'Dinner for the gala', price: 40, price_unit: 'person', payment_plan: 'DEPOSIT_50', status: 'ACTIVE' },
    });
    const contract = await as('vendor', http().post('/api/vendor/contracts/default')).send({
      category: 'PHOTO_VIDEO',
      field_values: { business_legal_name: 'Gala Caterers LLC', business_address: '1 Main St', cancellation_policy: 'moderate', governing_law: 'Texas, USA', delivery_time_days: '1', revisions_included: '0', usage_rights: 'personal' },
    });
    expect(contract.status).toBe(201);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  /** The customer signs and sends a request for 100 guests on `start`. */
  const book = async (start: Date) => {
    const body = { listing_id: LISTING, vendor_id: U.vendor, timezone: 'America/Chicago', event_start_at: start, event_end_at: new Date(start.getTime() + 4 * HOUR), venue_address: '5 Hall Rd, Austin TX', guest_count: 100, payment_method_id: 'pm_e2e_card' };
    const pv = await as('cust', http().post('/api/contracts/booking-preview')).send(body);
    expect(pv.status).toBe(201);
    expect(pv.body.data.pricing.price).toBe(4000);
    await sleep(2100);
    const created = await as('cust', http().post('/api/bookings')).send({ ...body, preview_token: pv.body.data.preview_token, signature: sig('Cara Customer', pv.body.data.content_sha256) });
    expect(created.status).toBe(201);
    return created.body.data.id as string;
  };

  const accept = async (bid: string) => {
    const contracts = await as('vendor', http().get(`/api/contracts/booking/${bid}`));
    const current = contracts.body.data.contracts.find((c: any) => c.id === contracts.body.data.current_id);
    await sleep(1100);
    const res = await as('vendor', http().patch(`/api/bookings/${bid}/confirm`)).send({ signature: sig('Vic Vendor', current.content_sha256) });
    expect(res.status).toBe(200);
  };

  /** A request with a 3-part plan suggested with the changes and approved: the fee and $2,000 on accept, $1,500 and $500 on dates. */
  const planned = async (start: Date, dates: [Date, Date]) => {
    const bid = await book(start);
    const state = await as('vendor', http().get(`/api/bookings/${bid}/changes`));
    expect(state.status).toBe(200);
    const fee = state.body.data.editor.current.service_fee;
    const plan = { payments: [{ amount: r2(2000 + fee) }, { amount: 1500, due_at: dates[0] }, { amount: 500, due_at: dates[1] }] };
    const pv = await as('vendor', http().post(`/api/bookings/${bid}/changes/preview`)).send({ payment_plan: plan, note: 'Pay as you go.' });
    expect(pv.status).toBe(201);
    await sleep(1100);
    const sent = await as('vendor', http().post(`/api/bookings/${bid}/changes`)).send({ payment_plan: plan, note: 'Pay as you go.', signature: sig('Vic Vendor', pv.body.data.content_sha256) });
    expect(sent.status).toBe(201);
    await sleep(1100);
    const ok = await as('cust', http().post(`/api/bookings/${bid}/changes/approve`)).send({ signature: sig('Cara Customer', pv.body.data.content_sha256) });
    expect(ok.status).toBe(201);
    return { bid, fee, preview: pv.body.data };
  };

  it('a request: the vendor suggests a 3-part plan, the customer approves, the first part is charged on accept', async () => {
    const start = new Date(Date.now() + 60 * DAY);
    start.setUTCHours(18, 0, 0, 0);
    const bid = await book(start);
    const state = await as('vendor', http().get(`/api/bookings/${bid}/changes`));
    expect(state.body.data.editor.payment_plan).toMatchObject({ package_plan: 'DEPOSIT_50', min_payments: 2, max_payments: 12, min_payment: 50, pay_after: false });
    const fee = state.body.data.editor.current.service_fee;
    expect(fee).toBeGreaterThan(0);
    const preview = (payment_plan: any) => as('vendor', http().post(`/api/bookings/${bid}/changes/preview`)).send({ payment_plan });
    const second = new Date(start.getTime() - 30 * DAY);
    const third = new Date(start.getTime() - 7 * DAY);

    // checked on the server: the total, the fee on the first payment, the dates
    const short = await preview({ payments: [{ amount: r2(fee + 10) }, { amount: 3490, due_at: second }, { amount: 500, due_at: third }] });
    expect(short.status).toBe(400);
    expect(msg(short)).toMatch(/includes the Vendly Protection fee of/);
    const off = await preview({ payments: [{ amount: r2(2000 + fee) }, { amount: 1500, due_at: second }, { amount: 499, due_at: third }] });
    expect(msg(off)).toMatch(/add up to .* but .* is the total/);
    const late = await preview({ payments: [{ amount: r2(2000 + fee) }, { amount: 1500, due_at: second }, { amount: 500, due_at: new Date(start.getTime() + DAY) }] });
    expect(msg(late)).toMatch(/by the event start/);
    const order = await preview({ payments: [{ amount: r2(2000 + fee) }, { amount: 1500, due_at: third }, { amount: 500, due_at: second }] });
    expect(msg(order)).toMatch(/Payment 3 must be due after payment 2/);
    const one = await preview({ payments: [{ amount: r2(4000 + fee) }] });
    expect(msg(one)).toMatch(/2 to 12 payments/);

    const plan = { payments: [{ amount: r2(2000 + fee) }, { amount: 1500, due_at: second }, { amount: 500, due_at: third }] };
    const pv = await preview(plan);
    expect(pv.status).toBe(201);
    const d = pv.body.data;
    expect(d.changes).toEqual(['Payment plan: 3 payments']);
    expect(d.before).toMatchObject({ plan: 'DEPOSIT_50' });
    expect(d.before.schedule).toHaveLength(2);
    expect(d.after).toMatchObject({ plan: 'CUSTOM', price: 4000, total: r2(4000 + fee) });
    expect(d.after.schedule.map((s: any) => [s.label, s.amount, s.due_at])).toEqual([
      ['Payment 1 of 3 (deposit)', r2(2000 + fee), null],
      ['Payment 2 of 3', 1500, second.toISOString()],
      ['Payment 3 of 3', 500, third.toISOString()],
    ]);
    // Schedule A of the updated contract lists each payment
    expect(d.body).toContain('### Payment plan');
    expect(d.body).toContain(`- Payment 1 of 3 (deposit): $${(2000 + fee).toLocaleString('en-US', { minimumFractionDigits: 2 })} when the Vendor accepts`);
    expect(d.body).toContain('- Payment 2 of 3: $1,500.00 on ');
    expect(d.body).toContain('The first payment is the deposit: it is non-refundable');
    await sleep(1100);
    const sent = await as('vendor', http().post(`/api/bookings/${bid}/changes`)).send({ ...plan, payment_plan: plan, signature: sig('Vic Vendor', d.content_sha256) }).catch((e) => e);
    // the plan goes under payment_plan only
    expect(sent.status).toBe(400);
    const sentOk = await as('vendor', http().post(`/api/bookings/${bid}/changes`)).send({ payment_plan: plan, signature: sig('Vic Vendor', d.content_sha256) });
    expect(sentOk.status).toBe(201);

    // the customer sees the plan before and after, and approves by signing
    const theirs = await as('cust', http().get(`/api/bookings/${bid}/changes`));
    expect(theirs.body.data.proposal.after.schedule).toHaveLength(3);
    expect(theirs.body.data.proposal.before.plan).toBe('DEPOSIT_50');
    const inbox = await prisma.notification.findMany({ where: { receiver_id: U.cust, entity_id: bid }, include: { notification_event: true } });
    expect(inbox.some((n: any) => /suggested changes/.test(n.notification_event.text))).toBe(true);
    await sleep(1100);
    expect((await as('cust', http().post(`/api/bookings/${bid}/changes/approve`)).send({ signature: sig('Cara Customer', d.content_sha256) })).status).toBe(201);
    const b = await prisma.booking.findUnique({ where: { id: bid } });
    expect(b.payment_plan).toBe('CUSTOM');
    expect(b.custom_payment_plan.payments.map((p: any) => [p.amount, p.fee_amount])).toEqual([[r2(2000 + fee), fee], [1500, 0], [500, 0]]);

    // Accept & Sign: the first payment is charged, the others wait for their dates
    await accept(bid);
    let rows = await charges(bid);
    expect(rows.map((i: any) => [i.label, Number(i.amount), Number(i.fee_amount), i.status])).toEqual([
      ['Payment 1 of 3 (deposit)', r2(2000 + fee), fee, 'PAID'],
      ['Payment 2 of 3', 1500, 0, 'SCHEDULED'],
      ['Payment 3 of 3', 500, 0, 'SCHEDULED'],
    ]);
    expect(rows[1].due_at.toISOString()).toBe(second.toISOString());
    expect(chargeOf(rows[0].payment_intent_id)?.amount).toBe(r2(2000 + fee));

    // the scheduler takes the second payment on its date, not before
    await payments.runDueCharges(new Date(second.getTime() - HOUR));
    expect((await charges(bid)).map((i: any) => i.status)).toEqual(['PAID', 'SCHEDULED', 'SCHEDULED']);
    await payments.runDueCharges(new Date(second.getTime() + 60_000));
    rows = await charges(bid);
    expect(rows.map((i: any) => i.status)).toEqual(['PAID', 'PAID', 'SCHEDULED']);
    expect(chargeOf(rows[1].payment_intent_id)?.amount).toBe(1500);

    // the third is declined: the pending-payment window starts, as a balance payment
    declined.add(rows[2].id);
    await payments.runDueCharges(new Date(third.getTime() + 60_000));
    const pending = await prisma.booking.findUnique({ where: { id: bid } });
    expect(pending.payment_due_kind).toBe('balance');
    expect(pending.payment_due_by.getTime()).toBeGreaterThan(Date.now());
    rows = await charges(bid);
    expect(rows[2]).toMatchObject({ attempts: 1, last_error: 'Your card was declined.' });
    const timeline = await as('cust', http().get(`/api/bookings/${bid}/payments`));
    expect(timeline.body.data).toMatchObject({ plan: 'CUSTOM', payment_state: 'pending_balance', outstanding: 500 });

    // the customer pays it: the window closes
    declined.delete(rows[2].id);
    const paid = await as('cust', http().post(`/api/bookings/${bid}/installments/${rows[2].id}/retry`)).send({});
    expect(paid.status).toBe(201);
    const after = await prisma.booking.findUnique({ where: { id: bid } });
    expect(after).toMatchObject({ payment_due_by: null, payment_due_kind: null });
    expect((await charges(bid)).map((i: any) => i.status)).toEqual(['PAID', 'PAID', 'PAID']);
  });

  it('a confirmed booking: the vendor proposes a plan for what’s left; declined it changes nothing, signed it replaces the unpaid payments', async () => {
    const start = new Date(Date.now() + 50 * DAY);
    start.setUTCHours(18, 0, 0, 0);
    const bid = await book(start);
    await accept(bid);
    // the 50% deposit (with the fee) was taken; the $2,000 balance waits for 7 days before the event
    let rows = await charges(bid);
    expect(rows.map((i: any) => [Number(i.amount) - Number(i.fee_amount), i.status])).toEqual([[2000, 'PAID'], [2000, 'SCHEDULED']]);

    const state = await as('vendor', http().get(`/api/bookings/${bid}/payment-plan`));
    expect(state.status).toBe(200);
    expect(state.body.data).toMatchObject({ role: 'VENDOR', can_propose: true, proposal: null, rules: { owed: 2000, fee_owed: 0, paid_count: 1, min_payments: 2, max_payments: 12 } });
    expect(state.body.data.payments.map((p: any) => p.status)).toEqual(['PAID', 'SCHEDULED']);
    expect((await as('cust', http().get(`/api/bookings/${bid}/payment-plan`))).body.data).toMatchObject({ role: 'CUSTOMER', can_propose: false, rules: null });
    expect((await as('other', http().get(`/api/bookings/${bid}/payment-plan`))).status).toBe(403);

    const plan = { payments: [{ amount: 1000 }, { amount: 1000, due_at: new Date(start.getTime() - 10 * DAY) }], note: 'Half now, half in a few weeks.' };
    expect((await as('cust', http().post(`/api/bookings/${bid}/payment-plan/preview`)).send(plan)).status).toBe(403);
    const late = await as('vendor', http().post(`/api/bookings/${bid}/payment-plan/preview`)).send({ payments: [{ amount: 1000 }, { amount: 1000, due_at: new Date(start.getTime() + DAY) }] });
    expect(late.status).toBe(400);
    expect(msg(late)).toMatch(/by the event start/);
    const pv = await as('vendor', http().post(`/api/bookings/${bid}/payment-plan/preview`)).send(plan);
    expect(pv.status).toBe(201);
    expect(pv.body.data.after.map((p: any) => [p.label, p.amount, p.due_at === null])).toEqual([['Payment 2 of 3', 1000, true], ['Payment 3 of 3', 1000, false]]);
    expect(pv.body.data.before.map((p: any) => p.status)).toEqual(['PAID', 'SCHEDULED']);
    expect(pv.body.data.body).toContain('Changed: payment plan.');
    expect(pv.body.data.body).toContain('- Payment 2 of 3: $1,000.00 when this amendment is signed');
    expect(pv.body.data.body).toContain('The payment already made on this booking stays its deposit.');

    // each proposal is a new contract version: reviewed (previewed) and signed again
    const send = async () => {
      const again = await as('vendor', http().post(`/api/bookings/${bid}/payment-plan/preview`)).send(plan);
      await sleep(1100);
      const res = await as('vendor', http().post(`/api/bookings/${bid}/payment-plan`)).send({ ...plan, signature: sig('Vic Vendor', again.body.data.content_sha256) });
      expect(res.status).toBe(201);
      return { contractId: res.body.data.contract_id as string, hash: again.body.data.content_sha256 as string };
    };
    await send();
    // the customer hears about it (in-app and a chat notice); another plan waits for this one
    const inbox = await prisma.notification.findMany({ where: { receiver_id: U.cust, entity_id: bid }, include: { notification_event: true } });
    expect(inbox.some((n: any) => /proposed a payment plan/.test(n.notification_event.text))).toBe(true);
    const notice = await prisma.message.findFirst({ where: { kind: 'system', text: { contains: 'proposed a payment plan' }, conversation: { participants: { some: { userId: U.cust } } } } });
    expect(notice).toBeTruthy();
    expect((await as('vendor', http().post(`/api/bookings/${bid}/payment-plan/preview`)).send(plan)).status).toBe(400);
    const waiting = await as('cust', http().get(`/api/bookings/${bid}/payment-plan`));
    expect(waiting.body.data.proposal).toMatchObject({ status: 'WAITING', vendor_name: 'Gala Caterers', note: 'Half now, half in a few weeks.', owed: 2000 });

    // declined: the current plan stays
    expect((await as('cust', http().post(`/api/bookings/${bid}/payment-plan/decline`)).send({ reason: 'We’d rather pay it at once' })).status).toBe(201);
    rows = await charges(bid);
    expect(rows.map((i: any) => i.status)).toEqual(['PAID', 'SCHEDULED']);
    expect((await prisma.booking.findUnique({ where: { id: bid } })).payment_plan).toBe('DEPOSIT_50');
    expect((await as('vendor', http().get(`/api/bookings/${bid}/payment-plan`))).body.data).toMatchObject({ can_propose: true, proposal: { status: 'DECLINED' } });

    // proposed again and signed: the balance is replaced, the first new payment is charged now
    const { contractId, hash } = await send();
    const typed = await as('cust', http().post(`/api/bookings/${bid}/payment-plan/approve`)).send({ signature: sig('Cara Customer', hash, false) });
    expect(typed.status).toBe(400);
    await sleep(1100);
    const ok = await as('cust', http().post(`/api/bookings/${bid}/payment-plan/approve`)).send({ signature: sig('Cara Customer', hash) });
    expect(ok.status).toBe(201);
    rows = await charges(bid);
    expect(rows.map((i: any) => [i.label, Number(i.amount), i.status])).toEqual([
      ['50% deposit', rows[0].amount * 1, 'PAID'],
      ['Balance', 2000, 'CANCELLED'],
      ['Payment 2 of 3', 1000, 'PAID'],
      ['Payment 3 of 3', 1000, 'SCHEDULED'],
    ]);
    expect(chargeOf(rows[2].payment_intent_id)?.amount).toBe(1000);
    const b = await prisma.booking.findUnique({ where: { id: bid } });
    expect(b.payment_plan).toBe('CUSTOM');
    const c = await prisma.bookingContract.findUnique({ where: { id: contractId }, include: { signatures: true } });
    expect(c.status).toBe('EXECUTED');
    expect(c.signatures.map((s: any) => s.role).sort()).toEqual(['CUSTOMER', 'VENDOR']);
    expect((await as('vendor', http().get(`/api/bookings/${bid}/payment-plan`))).body.data.proposal.status).toBe('APPROVED');
    const vendorInbox = await prisma.notification.findMany({ where: { receiver_id: U.vendor, entity_id: bid }, include: { notification_event: true } });
    expect(vendorInbox.some((n: any) => /signed the payment plan/.test(n.notification_event.text))).toBe(true);
    const timeline = await as('cust', http().get(`/api/bookings/${bid}/payments`));
    expect(timeline.body.data).toMatchObject({ plan: 'CUSTOM', outstanding: 1000 });
  });

  it('the customer cancels after two payments: the first stays with the vendor as the deposit, the rest follows the policy', async () => {
    // 20 days out: under the moderate policy half of what's paid beyond the deposit comes back
    const start = new Date(Date.now() + 20 * DAY);
    start.setUTCHours(18, 0, 0, 0);
    const second = new Date(Date.now() + 5 * DAY);
    const { bid, fee } = await planned(start, [second, new Date(Date.now() + 15 * DAY)]);
    await accept(bid);
    await payments.runDueCharges(new Date(second.getTime() + 60_000));
    const rows = await charges(bid);
    expect(rows.map((i: any) => i.status)).toEqual(['PAID', 'PAID', 'SCHEDULED']);

    const preview = await as('cust', http().get(`/api/bookings/${bid}/cancel-preview`));
    expect(preview.status).toBe(200);
    // paid to the vendor: $2,000 deposit + $1,500; kept: the deposit and half of the $1,500; the fee isn't refunded
    expect(preview.body.data).toMatchObject({ cancelled_by: 'CUSTOMER', percent: 50, deposit_kept: 2000, vendor_keeps: 2750, refund_total: 750, fee_kept: fee, unpaid_cancelled: 500 });

    const res = await as('cust', http().patch(`/api/bookings/${bid}/cancel`)).send({ reason_code: 'plans_changed' });
    expect(res.status).toBe(200);
    // the refund comes from the latest payment; the unpaid third is never charged
    expect(refunds.at(-1)).toEqual({ pi: rows[1].payment_intent_id, amount: 750 });
    const after = await charges(bid);
    expect(after.map((i: any) => [i.status, Number(i.refunded_amount)])).toEqual([['PAID', 0], ['PAID', 750], ['CANCELLED', 0]]);
  });
});
