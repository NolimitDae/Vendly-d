/**
 * Suggested changes to a booking request against a real Postgres + Redis: the customer requests, the
 * vendor suggests changes (an add-on repriced, the date moved, more guests, a different customization, a
 * fee added) and signs; the customer sees the before and after, approves and signs; the vendor accepts as
 * usual and the card is charged on the new total. Also: declining keeps the original terms, the vendor
 * can't accept the old terms while a suggestion waits, and can withdraw it.
 * Runs only when CONTRACTS_E2E_DATABASE_URL points at a migrated, disposable database:
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... yarn test:e2e request-changes
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { signedIn } from './e2e-sessions';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;
const SECRET = 'changes-e2e-secret';

if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_changes_e2e';
  process.env.APP_URL = 'http://changes.test';
  process.env.CLIENT_APP_URL = 'http://localhost:3000';
  process.env.PRIVATE_STORAGE_DIR = `/tmp/changes-e2e-${process.pid}`;
}

jest.setTimeout(240_000);

// a drawn signature (64x32 PNG) is required to sign
const SIGNATURE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAiElEQVR42u2XWwrAMAgEc/9L2xOEYh67G5iBfFbHVMSMAQAAAHCfmhy3k61w9yVIclfjuLpRVrxVxpGvk0QlFVm8Ui62eIXgNHaFtdjpTviNdypZvRor/a9JvHaS3Rxe0nmyUkjq5F726nyoXGCkO0X69ibxSt/fJV7JLziZV+IbPtkLAADgJT6abb9BSgfpowAAAABJRU5ErkJggg==';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = 86400e3;
const HOUR = 3600e3;

run('Suggested changes to a booking request (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  const id = randomBytes(4).toString('hex');
  const U = { vendor: `rv-${id}`, cust: `rc-${id}`, other: `ro-${id}`, planner: `rp-${id}`, client: `rl-${id}` };
  const types: Record<string, string> = { vendor: 'VENDOR', cust: 'CUSTOMER', other: 'CUSTOMER', planner: 'EVENT_PLANNER', client: 'CUSTOMER' };
  const T = Object.fromEntries(Object.entries(U).map(([k, sub]) => [k, jwt.sign({ sub, email: `${sub}@t.test`, type: types[k] }, SECRET)])) as Record<keyof typeof U, string>;
  const L = { party: `lp-${id}` };
  const A = { bartender: `ab-${id}`, dessert: `ad-${id}`, travel: `at-${id}` };

  const start = new Date(Date.now() + 40 * DAY);
  start.setUTCHours(16, 0, 0, 0);
  const end = new Date(start.getTime() + 4 * HOUR);
  const fields = { listing_id: L.party, vendor_id: U.vendor, timezone: 'America/Chicago', event_start_at: start, event_end_at: end, venue_address: '12 Party Lane, Austin TX', guest_count: 10 };
  const sig = (name: string, hash: string, drawn = true) => ({ legal_name: name, consent: true, content_sha256: hash, device_platform: 'web', ...(drawn ? { signature_image: SIGNATURE_PNG } : {}) });
  const http = () => request(app.getHttpServer());
  const as = (who: keyof typeof U, r: request.Test) => r.auth(T[who], { type: 'bearer' });
  const msg = (res: request.Response) => res.body?.message?.message ?? res.body?.message;

  const G: Record<string, any> = {};
  const charged: { amount: number; pi: string }[] = [];
  // this run's charge for a payment (the suites share a database, so the payment jobs may charge other suites' bookings in between)
  const chargeOf = (pi: string | null) => charged.find((c) => c.pi === pi);

  beforeAll(async () => {
    const { StripePayment } = await import('../src/common/lib/Payment/stripe/StripePayment');
    let n = 0;
    jest.spyOn(StripePayment, 'chargeSavedCard').mockImplementation(async (o: any) => {
      const pi = `pi_chg_${id}_${++n}`;
      charged.push({ amount: o.amount, pi });
      return { id: pi, status: 'succeeded' } as any;
    });
    jest.spyOn(StripePayment, 'refundPaymentIntent').mockResolvedValue({ id: 're_x', status: 'succeeded' } as any);
    jest.spyOn(StripePayment, 'retrievePaymentMethod').mockResolvedValue({ card: { brand: 'visa', last4: '4242' } } as any);

    const { AppModule } = await import('../src/app.module');
    const { PrismaService } = await import('../src/prisma/prisma.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
    await signedIn(app, Object.values(U));
    prisma = app.get(PrismaService);

    await prisma.user.createMany({
      data: Object.entries(U).map(([k, uid]) => ({ id: uid, email: `${uid}@t.test`, name: `${k} user`, type: types[k], ...(k !== 'vendor' ? { billing_id: `cus_${uid}` } : {}) })),
    });
    await prisma.vendorProfile.create({ data: { user_id: U.vendor, business_name: 'Party Pros', address: '1 Main St' } });
    // a party package priced per person, paid with a 50% deposit
    await prisma.vendorListing.create({
      data: { id: L.party, vendor_id: U.vendor, title: 'Party service', description: 'Staff and setup', price: 45, price_unit: 'person', payment_plan: 'DEPOSIT_50', status: 'ACTIVE' },
    });
    await prisma.vendorAddOn.createMany({
      data: [
        { id: A.bartender, vendor_id: U.vendor, kind: 'ADD_ON', name: 'Bartender', price: 50, price_unit: 'PER_HOUR' },
        { id: A.dessert, vendor_id: U.vendor, kind: 'ADD_ON', name: 'Dessert table', price: 100, price_unit: 'FIXED' },
        { id: A.travel, vendor_id: U.vendor, kind: 'FEE', name: 'Extra travel', price: 40, price_unit: 'FIXED' },
      ],
    });
    await prisma.listingAddOn.createMany({ data: Object.values(A).map((add_on_id, sort) => ({ listing_id: L.party, add_on_id, sort })) });
    const groups = await as('vendor', http().put(`/api/vendor/listings/${L.party}/customizations`)).send({
      groups: [{ title: 'Style', required: true, options: [{ label: 'Classic', price: 20 }, { label: 'Deluxe', price: 35 }, { label: 'Simple' }] }],
    });
    expect(groups.status).toBe(200);
    G.style = groups.body.data[0];
    const contract = await as('vendor', http().post('/api/vendor/contracts/default')).send({
      category: 'PHOTO_VIDEO',
      field_values: { business_legal_name: 'Party Pros LLC', business_address: '1 Main St', cancellation_policy: 'moderate', governing_law: 'Texas, USA', delivery_time_days: '1', revisions_included: '0', usage_rights: 'personal' },
    });
    expect(contract.status).toBe(201);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  const style = (i: number) => [{ group_id: G.style.id, option_ids: [G.style.options[i].id] }];

  /** The customer previews, signs and sends a request: 10 guests, a bartender for the 4 hours, a dessert table, Classic style. */
  const book = async () => {
    const body = { ...fields, add_ons: [{ add_on_id: A.bartender }, { add_on_id: A.dessert }], options: style(0), payment_method_id: 'pm_e2e_card' };
    const pv = await as('cust', http().post('/api/contracts/booking-preview')).send(body);
    expect(pv.status).toBe(201);
    // 10 × $45 + bartender $50 × 4 hours + dessert table $100 + Classic $20
    expect(pv.body.data.pricing.price).toBe(770);
    await sleep(2100);
    const created = await as('cust', http().post('/api/bookings')).send({ ...body, preview_token: pv.body.data.preview_token, signature: sig('Cara Customer', pv.body.data.content_sha256) });
    expect(created.status).toBe(201);
    return created.body.data.id as string;
  };

  /** The vendor's suggestion: a day later, 12 guests, the bartender at $40 an hour, no dessert table, the travel fee at $55, Deluxe style. */
  const suggestion = async (bid: string) => {
    const state = await as('vendor', http().get(`/api/bookings/${bid}/changes`));
    expect(state.status).toBe(200);
    const lines = state.body.data.editor.current.lines;
    const bartender = lines.find((l: any) => l.name === 'Bartender');
    return {
      event_start_at: new Date(start.getTime() + DAY),
      event_end_at: new Date(end.getTime() + DAY),
      guest_count: 12,
      lines: [
        { extra_id: bartender.extra_id, unit_price: 40 },
        { add_on_id: A.travel, unit_price: 55 },
      ],
      options: style(1),
      note: 'We can do Saturday instead, and travel is a bit further than usual.',
    };
  };

  /** Vendor's Accept & Sign on whatever contract is waiting for them. */
  const accept = (bid: string, hash: string) => as('vendor', http().patch(`/api/bookings/${bid}/confirm`)).send({ signature: sig('Vic Vendor', hash) });

  let bookingId = '';
  let proposalHash = '';

  it('the vendor opens the editor prefilled with the request', async () => {
    bookingId = await book();
    const res = await as('vendor', http().get(`/api/bookings/${bookingId}/changes`));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ role: 'VENDOR', can_suggest: true, proposal: null });
    const cur = res.body.data.editor.current;
    expect(cur).toMatchObject({ guest_count: 10, price: 770, package: { unit: 'person', unit_price: 45, quantity: 10, amount: 450 } });
    expect(cur.lines.map((l: any) => [l.name, l.amount])).toEqual([['Bartender', 200], ['Dessert table', 100]]);
    expect(cur.options[0].options[0].label).toBe('Classic');
    // the vendor's add-ons and fees to add from, and the package's customizations
    expect(res.body.data.editor.fees.map((f: any) => f.name)).toContain('Extra travel');
    expect(res.body.data.editor.customizations[0].title).toBe('Style');
    // the customer can't edit
    const theirs = await as('cust', http().post(`/api/bookings/${bookingId}/changes/preview`)).send({ guest_count: 11 });
    expect(theirs.status).toBe(403);
    const stranger = await as('other', http().get(`/api/bookings/${bookingId}/changes`));
    expect(stranger.status).toBe(403);
  });

  it('checks the suggestion on the server: prices in bounds, required customizations, something changed', async () => {
    const preview = (body: any) => as('vendor', http().post(`/api/bookings/${bookingId}/changes/preview`)).send(body);
    const negative = await preview({ lines: [{ add_on_id: A.travel, unit_price: -5 }] });
    expect(negative.status).toBe(400);
    const huge = await preview({ lines: [{ add_on_id: A.travel, unit_price: 100001 }] });
    expect(huge.status).toBe(400);
    const notMine = await preview({ lines: [{ add_on_id: 'someone-elses' }] });
    expect(notMine.status).toBe(400);
    expect(msg(notMine)).toMatch(/isn’t available/);
    const noStyle = await preview({ options: [] });
    expect(noStyle.status).toBe(400);
    expect(msg(noStyle)).toBe('Choose an option for “Style”.');
    const nothing = await preview({});
    expect(nothing.status).toBe(400);
    expect(msg(nothing)).toMatch(/Nothing has changed/);
    const past = await preview({ event_start_at: new Date(Date.now() - DAY) });
    expect(past.status).toBe(400);
  });

  it('the vendor previews the new total and the updated contract, then signs and sends', async () => {
    const body = await suggestion(bookingId);
    const pv = await as('vendor', http().post(`/api/bookings/${bookingId}/changes/preview`)).send(body);
    expect(pv.status).toBe(201);
    const d = pv.body.data;
    // 12 × $45 + bartender $40 × 4 hours + travel $55 + Deluxe $35
    expect(d.before.price).toBe(770);
    expect(d.after).toMatchObject({ price: 790, guest_count: 12, package: { amount: 540, quantity: 12 }, options_amount: 35 });
    expect(d.after.service_fee).toBeGreaterThan(0);
    expect(d.after.total).toBe(Math.round((790 + d.after.service_fee) * 100) / 100);
    // the deposit plan: half now (with the whole fee), half before the event
    expect(d.after.schedule[0].amount).toBe(Math.round((395 + d.after.service_fee) * 100) / 100);
    expect(d.after.schedule[1].amount).toBe(395);
    expect(d.changes).toEqual(expect.arrayContaining(['Date and time', 'Guests: 10 to 12', 'Customizations', 'Removed add-on: Dessert table']));
    expect(d.lines.map((r: any) => [r.before?.name ?? null, r.after?.amount ?? null])).toEqual([['Bartender', 160], ['Dessert table', null], [null, 55]]);
    // Schedule A carries the agreed prices
    expect(d.body).toContain('- Add-on: Bartender: $40.00 × 4 hours = $160.00');
    expect(d.body).toContain('- Fee: Extra travel = $55.00');
    expect(d.body).toContain('Customization: Style: Deluxe = $35.00');
    expect(d.body).toContain('Vendor price: $790.00');
    expect(d.body).toContain('## Changes suggested by the Vendor');
    expect(d.body).not.toContain('Add-on: Dessert table');
    expect(d.body).toContain('Removed add-on: Dessert table');

    // a typed name alone isn't a signature
    const typed = await as('vendor', http().post(`/api/bookings/${bookingId}/changes`)).send({ ...body, signature: sig('Vic Vendor', d.content_sha256, false) });
    expect(typed.status).toBe(400);
    await sleep(1100);
    const sent = await as('vendor', http().post(`/api/bookings/${bookingId}/changes`)).send({ ...body, signature: sig('Vic Vendor', d.content_sha256) });
    expect(sent.status).toBe(201);
    proposalHash = d.content_sha256;

    // the customer hears about it: in-app (and push), and a notice in their chat with the vendor
    const inbox = await prisma.notification.findMany({ where: { receiver_id: U.cust, entity_id: bookingId }, include: { notification_event: true } });
    expect(inbox.some((n: any) => /suggested changes/.test(n.notification_event.text))).toBe(true);
    const notice = await prisma.message.findFirst({ where: { kind: 'system', conversation: { is_group: false, participants: { some: { userId: U.cust } } }, text: { contains: 'suggested changes' } } });
    expect(notice).toBeTruthy();
  });

  it('while the suggestion waits, the vendor can’t accept the old terms and the request can’t expire', async () => {
    const contracts = await as('vendor', http().get(`/api/contracts/booking/${bookingId}`));
    const original = contracts.body.data.contracts.find((c: any) => c.version === 1);
    await sleep(1100);
    const res = await accept(bookingId, original.content_sha256);
    expect(res.status).toBe(409);
    expect(msg(res)).toMatch(/waiting for the customer/);
    const b = await as('vendor', http().get(`/api/bookings/${bookingId}`));
    expect(b.body.data).toMatchObject({ status: 'PENDING', changes_waiting: true, request_expires_at: null });
    // the expiry job leaves it alone even past the 72 hours
    const { BookingRemindersService } = await import('../src/modules/booking/booking-reminders.service');
    await app.get(BookingRemindersService).expireRequests(new Date(Date.now() + 4 * DAY));
    expect((await prisma.booking.findUnique({ where: { id: bookingId } })).status).toBe('PENDING');
    // a second suggestion waits for this one
    const again = await as('vendor', http().post(`/api/bookings/${bookingId}/changes/preview`)).send({ guest_count: 15 });
    expect(again.status).toBe(400);
  });

  it('the customer sees what changed, before and after', async () => {
    const res = await as('cust', http().get(`/api/bookings/${bookingId}/changes`));
    expect(res.status).toBe(200);
    const p = res.body.data.proposal;
    expect(p).toMatchObject({ status: 'WAITING', vendor_name: 'Party Pros', signed_by: 'Vic Vendor', note: expect.stringContaining('Saturday'), content_sha256: proposalHash });
    expect(p.before.price).toBe(770);
    expect(p.after.price).toBe(790);
    expect(p.before.event_start_at).toBe(start.toISOString());
    expect(p.after.event_start_at).toBe(new Date(start.getTime() + DAY).toISOString());
    expect(res.body.data.editor).toBeNull();
    // the updated contract is the one to review
    const c = await as('cust', http().get(`/api/contracts/booking/${bookingId}`));
    const v2 = c.body.data.contracts.find((x: any) => x.version === 2);
    expect(v2).toMatchObject({ status: 'AWAITING_CUSTOMER', is_proposal: true, is_amendment: false, can_sign: true });
    expect(c.body.data.current_id).toBe(v2.id);
    // it's signed from the booking, not as an amendment
    const wrongWay = await as('cust', http().post(`/api/contracts/${v2.id}/sign`)).send({ signature: sig('Cara Customer', proposalHash) });
    expect(wrongWay.status).toBe(400);
  });

  it('the customer approves and signs: the booking takes the new terms and goes back to the vendor', async () => {
    const typed = await as('cust', http().post(`/api/bookings/${bookingId}/changes/approve`)).send({ signature: sig('Cara Customer', proposalHash, false) });
    expect(typed.status).toBe(400);
    await sleep(1100);
    const res = await as('cust', http().post(`/api/bookings/${bookingId}/changes/approve`)).send({ signature: sig('Cara Customer', proposalHash) });
    expect(res.status).toBe(201);

    const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { extras: { orderBy: { created_at: 'asc' } } } });
    expect(b.status).toBe('PENDING');
    expect(Number(b.amount)).toBe(790);
    expect(b.guest_count).toBe(12);
    expect(b.event_start_at.toISOString()).toBe(new Date(start.getTime() + DAY).toISOString());
    expect(b.event_end_at.toISOString()).toBe(new Date(end.getTime() + DAY).toISOString());
    expect(b.chosen_options[0].options[0].label).toBe('Deluxe');
    expect(Number(b.options_amount)).toBe(35);
    expect(b.extras.map((e: any) => [e.kind, e.name, Number(e.unit_price), Number(e.amount), e.status])).toEqual([
      ['ADD_ON', 'Bartender', 40, 160, 'INCLUDED'],
      ['FEE', 'Extra travel', 55, 55, 'INCLUDED'],
    ]);
    // the vendor has at least 48 hours from now to accept
    const seen = await as('vendor', http().get(`/api/bookings/${bookingId}`));
    expect(seen.body.data.changes_waiting).toBe(false);
    expect(new Date(seen.body.data.request_expires_at).getTime()).toBeGreaterThan(Date.now() + 47 * HOUR);
    const state = await as('vendor', http().get(`/api/bookings/${bookingId}/changes`));
    expect(state.body.data.proposal.status).toBe('APPROVED');
    // the vendor heard
    const inbox = await prisma.notification.findMany({ where: { receiver_id: U.vendor, entity_id: bookingId }, include: { notification_event: true } });
    expect(inbox.some((n: any) => /approved your changes/.test(n.notification_event.text))).toBe(true);
  });

  it('the vendor accepts and signs the new version, and the card is charged on the new total', async () => {
    const contracts = await as('vendor', http().get(`/api/contracts/booking/${bookingId}`));
    const current = contracts.body.data.contracts.find((c: any) => c.id === contracts.body.data.current_id);
    expect(current).toMatchObject({ version: 2, status: 'AWAITING_VENDOR', is_proposal: true });
    expect(contracts.body.data.contracts.find((c: any) => c.version === 1).status).toBe('SUPERSEDED');
    await sleep(1100);
    const res = await accept(bookingId, current.content_sha256);
    expect(res.status).toBe(200);

    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(b.status).toBe('CONFIRMED');
    const fee = Number(b.service_fee);
    const deposit = await prisma.bookingInstallment.findFirst({ where: { booking_id: bookingId, sequence: 1 } });
    expect(deposit.status).toBe('PAID');
    expect(Number(deposit.amount)).toBe(Math.round((395 + fee) * 100) / 100);
    expect(chargeOf(deposit.payment_intent_id)?.amount).toBe(Math.round((395 + fee) * 100) / 100);
    const balance = await prisma.bookingInstallment.findFirst({ where: { booking_id: bookingId, sequence: 2 } });
    expect(Number(balance.amount)).toBe(395);

    // one executed contract, signed by the customer (approving) and the vendor (accepting); the vendor's
    // signature sent with the changes is kept with them and in the audit trail
    const v2 = await prisma.bookingContract.findFirst({ where: { booking_id: bookingId, version: 2 }, include: { signatures: true } });
    expect(v2.status).toBe('EXECUTED');
    expect(v2.signatures.map((s: any) => s.role).sort()).toEqual(['CUSTOMER', 'VENDOR']);
    expect(v2.merge_data.request_changes.vendor_signature).toMatchObject({ legal_name: 'Vic Vendor', document_sha256: v2.content_sha256 });
    const sentSigned = await prisma.contractAuditEvent.findFirst({ where: { booking_contract_id: v2.id, action: 'SIGNED', actor_role: 'VENDOR' } });
    expect(sentSigned.details).toMatchObject({ suggested_changes: true, legal_name: 'Vic Vendor' });
  });

  it('declining keeps the original request, which the vendor can still accept', async () => {
    const bid = await book();
    const body = await suggestion(bid);
    const pv = await as('vendor', http().post(`/api/bookings/${bid}/changes/preview`)).send(body);
    await sleep(1100);
    const sent = await as('vendor', http().post(`/api/bookings/${bid}/changes`)).send({ ...body, signature: sig('Vic Vendor', pv.body.data.content_sha256) });
    expect(sent.status).toBe(201);
    // only the customer answers
    const vendorTries = await as('vendor', http().post(`/api/bookings/${bid}/changes/decline`)).send({});
    expect(vendorTries.status).toBe(403);

    const res = await as('cust', http().post(`/api/bookings/${bid}/changes/decline`)).send({ reason: 'Saturday doesn’t work for us' });
    expect(res.status).toBe(201);
    const b = await prisma.booking.findUnique({ where: { id: bid }, include: { extras: true } });
    expect(Number(b.amount)).toBe(770);
    expect(b.guest_count).toBe(10);
    expect(b.event_start_at.toISOString()).toBe(start.toISOString());
    expect(b.extras.map((e: any) => e.name).sort()).toEqual(['Bartender', 'Dessert table']);
    const state = await as('vendor', http().get(`/api/bookings/${bid}/changes`));
    expect(state.body.data).toMatchObject({ can_suggest: true, proposal: { status: 'DECLINED' } });
    const inbox = await prisma.notification.findMany({ where: { receiver_id: U.vendor, entity_id: bid }, include: { notification_event: true } });
    expect(inbox.some((n: any) => /Saturday doesn’t work/.test(n.notification_event.text))).toBe(true);

    const contracts = await as('vendor', http().get(`/api/contracts/booking/${bid}`));
    const current = contracts.body.data.contracts.find((c: any) => c.id === contracts.body.data.current_id);
    expect(current).toMatchObject({ version: 1, status: 'AWAITING_VENDOR' });
    await sleep(1100);
    expect((await accept(bid, current.content_sha256)).status).toBe(200);
    const deposit = await prisma.bookingInstallment.findFirst({ where: { booking_id: bid, sequence: 1 } });
    expect(Number(deposit.amount)).toBe(Math.round((385 + Number(b.service_fee)) * 100) / 100);
  });

  it('the vendor can withdraw a suggestion, and the original request stands', async () => {
    const bid = await book();
    const pv = await as('vendor', http().post(`/api/bookings/${bid}/changes/preview`)).send({ guest_count: 14 });
    expect(pv.status).toBe(201);
    expect(pv.body.data.after.price).toBe(770 + 4 * 45);
    await sleep(1100);
    const sent = await as('vendor', http().post(`/api/bookings/${bid}/changes`)).send({ guest_count: 14, signature: sig('Vic Vendor', pv.body.data.content_sha256) });
    expect(sent.status).toBe(201);
    const custTries = await as('cust', http().post(`/api/bookings/${bid}/changes/withdraw`));
    expect(custTries.status).toBe(403);
    const res = await as('vendor', http().post(`/api/bookings/${bid}/changes/withdraw`));
    expect(res.status).toBe(201);
    const late = await as('cust', http().post(`/api/bookings/${bid}/changes/approve`)).send({ signature: sig('Cara Customer', pv.body.data.content_sha256) });
    expect(late.status).toBe(400);
    const b = await prisma.booking.findUnique({ where: { id: bid } });
    expect(b.guest_count).toBe(10);
    expect(Number(b.amount)).toBe(770);
  });

  it('a planner’s client who co-signed the request co-signs the approved changes before the vendor can accept', async () => {
    const flag = await prisma.featureFlag.findUnique({ where: { key: 'client_cosign' } });
    await prisma.featureFlag.upsert({ where: { key: 'client_cosign' }, create: { key: 'client_cosign', enabled: true }, update: { enabled: true } });
    try {
      const event = await prisma.event.create({ data: { event_planner_id: U.planner, name: 'Spring gala', client_email: `${U.client}@t.test` } });
      const body = { ...fields, event_id: event.id, options: style(0), payment_method_id: 'pm_e2e_card' };
      const pv = await as('planner', http().post('/api/contracts/booking-preview')).send(body);
      expect(pv.status).toBe(201);
      await sleep(2100);
      const created = await as('planner', http().post('/api/bookings')).send({ ...body, preview_token: pv.body.data.preview_token, signature: sig('Pat Planner', pv.body.data.content_sha256) });
      expect(created.status).toBe(201);
      const bid = created.body.data.id;
      const v1 = await prisma.bookingContract.findFirst({ where: { booking_id: bid, version: 1 } });
      expect(v1.status).toBe('AWAITING_CLIENT');
      expect((await as('client', http().post(`/api/contracts/${v1.id}/sign`)).send({ signature: sig('Cleo Client', v1.content_sha256) })).status).toBe(201);

      // the vendor moves only the start: the end moves with it, so the event keeps its length
      const moved = { event_start_at: new Date(start.getTime() + DAY) };
      const cp = await as('vendor', http().post(`/api/bookings/${bid}/changes/preview`)).send(moved);
      expect(cp.status).toBe(201);
      expect(cp.body.data.after.event_end_at).toBe(new Date(end.getTime() + DAY).toISOString());
      await sleep(1100);
      expect((await as('vendor', http().post(`/api/bookings/${bid}/changes`)).send({ ...moved, signature: sig('Vic Vendor', cp.body.data.content_sha256) })).status).toBe(201);
      await sleep(1100);
      expect((await as('planner', http().post(`/api/bookings/${bid}/changes/approve`)).send({ signature: sig('Pat Planner', cp.body.data.content_sha256) })).status).toBe(201);

      // the client co-signs next; the vendor can't accept before
      const v2 = await prisma.bookingContract.findFirst({ where: { booking_id: bid, version: 2 } });
      expect(v2).toMatchObject({ status: 'AWAITING_CLIENT', client_email: `${U.client}@t.test` });
      const state = await as('planner', http().get(`/api/bookings/${bid}/changes`));
      expect(state.body.data.proposal).toMatchObject({ status: 'APPROVED', client_cosigning: true });
      await sleep(1100);
      const early = await accept(bid, v2.content_sha256);
      expect(early.status).toBe(400);
      expect(msg(early)).toMatch(/client hasn’t co-signed/);
      const theirs = await as('client', http().get(`/api/contracts/client/event/${event.id}`));
      expect(theirs.body.data.find((c: any) => c.id === v2.id)).toMatchObject({ can_sign: true });
      await sleep(1100);
      expect((await as('client', http().post(`/api/contracts/${v2.id}/sign`)).send({ signature: sig('Cleo Client', v2.content_sha256) })).status).toBe(201);
      await sleep(1100);
      expect((await accept(bid, v2.content_sha256)).status).toBe(200);
      const executed = await prisma.bookingContract.findUnique({ where: { id: v2.id }, include: { signatures: true } });
      expect(executed.status).toBe('EXECUTED');
      expect(executed.signatures.map((s: any) => s.role).sort()).toEqual(['CLIENT', 'PLANNER', 'VENDOR']);
    } finally {
      if (flag) await prisma.featureFlag.update({ where: { key: 'client_cosign' }, data: { enabled: flag.enabled } });
      else await prisma.featureFlag.delete({ where: { key: 'client_cosign' } });
    }
  });

  it('the package keeps the price and minimum it was requested at, whatever the listing says now', async () => {
    const bid = await book();
    // the vendor edits the package after the request
    await prisma.vendorListing.update({ where: { id: L.party }, data: { price: 80, price_unit: 'hour', min_quantity: 6 } });
    try {
      const pv = await as('vendor', http().post(`/api/bookings/${bid}/changes/preview`)).send({ guest_count: 12 });
      expect(pv.status).toBe(201);
      expect(pv.body.data.before.package).toMatchObject({ unit: 'person', unit_price: 45, quantity: 10, amount: 450 });
      expect(pv.body.data.after.package).toMatchObject({ unit: 'person', unit_price: 45, quantity: 12, amount: 540 });
      // and it was kept with the request's contract
      const v1 = await prisma.bookingContract.findFirst({ where: { booking_id: bid, version: 1 } });
      expect(v1.merge_data.package_terms).toMatchObject({ unit: 'person', unit_price: 45, quantity: 10 });
    } finally {
      await prisma.vendorListing.update({ where: { id: L.party }, data: { price: 45, price_unit: 'person', min_quantity: null } });
    }
  });
});
