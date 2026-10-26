/**
 * Package customizations (dropdowns with upcharges) and dos and don'ts against a real Postgres + Redis:
 * the vendor sets them up, a customer books with choices on a 50% deposit plan, and the charges, the
 * refund and the vendor payout all include the upcharges. Later package edits leave the booking alone.
 * Runs only when CONTRACTS_E2E_DATABASE_URL points at a migrated, disposable database:
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... yarn test:e2e package-options
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;
const SECRET = 'options-e2e-secret';

if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_options_e2e';
  process.env.APP_URL = 'http://options.test';
  process.env.CLIENT_APP_URL = 'http://localhost:3000';
  process.env.PRIVATE_STORAGE_DIR = `/tmp/options-e2e-${process.pid}`;
}

jest.setTimeout(240_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = 86400e3;

run('Package customizations and dos and don’ts (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  let payments: any;
  let StripePayment: any;
  const id = randomBytes(4).toString('hex');
  const U = { vendor: `pv-${id}`, other: `po-${id}`, cust: `pc-${id}` };
  const types: Record<string, string> = { vendor: 'VENDOR', other: 'VENDOR', cust: 'CUSTOMER' };
  const T = Object.fromEntries(Object.entries(U).map(([k, sub]) => [k, jwt.sign({ sub, email: `${sub}@t.test`, type: types[k] }, SECRET)])) as Record<keyof typeof U, string>;
  const L = { braids: `lb-${id}` };

  const start = new Date(Date.now() + 40 * DAY);
  start.setUTCHours(16, 0, 0, 0);
  const end = new Date(start.getTime() + 4 * 3600e3);
  const fields = { listing_id: L.braids, vendor_id: U.vendor, timezone: 'America/Chicago', event_start_at: start, event_end_at: end, venue_address: '12 Salon Row, Austin TX', guest_count: 10 };
  const sig = (name: string, hash: string) => ({ legal_name: name, consent: true, content_sha256: hash, device_platform: 'web' });
  const http = () => request(app.getHttpServer());
  const as = (who: keyof typeof U, r: request.Test) => r.auth(T[who], { type: 'bearer' });
  const msg = (res: request.Response) => res.body?.message?.message ?? res.body?.message;

  const G: Record<string, any> = {};
  const charged: { amount: number; pi: string }[] = [];
  const refunded: { pi: string; amount?: number }[] = [];
  let bookingId = '';

  beforeAll(async () => {
    ({ StripePayment } = await import('../src/common/lib/Payment/stripe/StripePayment'));
    // the card is charged and refunded through Stripe: recorded here instead
    let n = 0;
    jest.spyOn(StripePayment, 'chargeSavedCard').mockImplementation(async (o: any) => {
      const pi = `pi_opt_${id}_${++n}`;
      charged.push({ amount: o.amount, pi });
      return { id: pi, status: 'succeeded' };
    });
    jest.spyOn(StripePayment, 'refundPaymentIntent').mockImplementation(async (pi: string, _key: string, amount?: number) => {
      refunded.push({ pi, amount });
      return { id: `re_${pi}`, status: 'succeeded' };
    });
    jest.spyOn(StripePayment, 'retrievePaymentMethod').mockResolvedValue({ card: { brand: 'visa', last4: '4242' } });

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
      data: Object.entries(U).map(([k, uid]) => ({ id: uid, email: `${uid}@t.test`, name: `${k} user`, type: types[k], ...(k === 'cust' ? { billing_id: `cus_${id}` } : {}) })),
    });
    await prisma.vendorProfile.create({ data: { user_id: U.vendor, business_name: 'Bee Braids', address: '12 Salon Row' } });
    // braids for a group, priced per person, paid with a 50% deposit
    await prisma.vendorListing.create({
      data: { id: L.braids, vendor_id: U.vendor, title: 'Bridal party braids', description: 'Braids for the whole party', price: 45, price_unit: 'person', payment_plan: 'DEPOSIT_50', status: 'ACTIVE' },
    });
    const contract = await as('vendor', http().post('/api/vendor/contracts/default')).send({
      category: 'PHOTO_VIDEO',
      field_values: { business_legal_name: 'Bee Braids LLC', business_address: '12 Salon Row', cancellation_policy: 'moderate', governing_law: 'Texas, USA', delivery_time_days: '1', revisions_included: '0', usage_rights: 'personal' },
    });
    expect(contract.status).toBe(201);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  it('vendor adds customizations and dos and don’ts to the package', async () => {
    const tooMany = await as('vendor', http().put(`/api/vendor/listings/${L.braids}/customizations`)).send({
      groups: [{ title: 'Style', max_select: 3, options: [{ label: 'Knotless' }, { label: 'Miracle knots' }] }],
    });
    expect(tooMany.status).toBe(400);
    expect(msg(tooMany)).toMatch(/pick up to 3, but it only has 2 options/);

    const notMine = await as('other', http().put(`/api/vendor/listings/${L.braids}/customizations`)).send({ groups: [] });
    expect(notMine.status).toBe(403);

    const res = await as('vendor', http().put(`/api/vendor/listings/${L.braids}/customizations`)).send({
      groups: [
        { title: 'Style', required: true, options: [{ label: 'Knotless', price: 20 }, { label: 'Miracle knots', price: 35 }, { label: 'Box braids' }] },
        { title: 'Extras', max_select: 2, options: [{ label: 'Beads', price: 5, price_mode: 'PER_UNIT' }, { label: 'Curled ends', price: 10 }, { label: 'Wash', price: 15 }] },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.map((g: any) => g.title)).toEqual(['Style', 'Extras']);
    G.style = res.body.data[0];
    G.extras = res.body.data[1];

    const dos = await as('vendor', http().patch(`/api/vendor/listings/${L.braids}`))
      .field('dos', JSON.stringify(['Wrap your hair at night']))
      .field('donts', JSON.stringify(['Don’t wash for the first week', 'Don’t use heavy oils']));
    expect(dos.status).toBe(200);
    expect(dos.body.data).toMatchObject({ dos: ['Wrap your hair at night'], donts: ['Don’t wash for the first week', 'Don’t use heavy oils'] });

    const tooLong = await as('vendor', http().patch(`/api/vendor/listings/${L.braids}`)).field('dos', JSON.stringify(['x'.repeat(201)]));
    expect(tooLong.status).toBe(400);

    const mine = await as('vendor', http().get(`/api/vendor/listings/${L.braids}`));
    expect(mine.body.data.customizations).toHaveLength(2);
  });

  it('customers see the customizations with their upcharges, and the dos and don’ts, on the package', async () => {
    const res = await http().get(`/api/marketplace/listings/${L.braids}`);
    expect(res.status).toBe(200);
    expect(res.body.data.customizations[0]).toMatchObject({ title: 'Style', required: true, max_select: 1, selection_text: 'Pick one' });
    expect(res.body.data.customizations[0].options.map((o: any) => o.price_text)).toEqual(['+$20.00', '+$35.00', '']);
    expect(res.body.data.customizations[1].options.map((o: any) => o.price_text)).toEqual(['+$5.00 / person', '+$10.00', '+$15.00']);
    expect(res.body.data.dos).toEqual(['Wrap your hair at night']);
    expect(res.body.data.donts).toHaveLength(2);
  });

  const choices = () => [
    { group_id: G.style.id, option_ids: [G.style.options[0].id] },
    { group_id: G.extras.id, option_ids: [G.extras.options[0].id, G.extras.options[1].id] },
  ];

  it('the server checks the choices: required answered, ids its own, no more than allowed', async () => {
    const preview = (options: unknown) => as('cust', http().post('/api/contracts/booking-preview')).send({ ...fields, options });
    const none = await preview(undefined);
    expect(none.status).toBe(400);
    expect(msg(none)).toBe('Choose an option for “Style”.');
    const stranger = await preview([{ group_id: G.style.id, option_ids: [G.extras.options[0].id] }]);
    expect(stranger.status).toBe(400);
    expect(msg(stranger)).toMatch(/no longer offered/);
    const three = await preview([{ group_id: G.style.id, option_ids: [G.style.options[0].id] }, { group_id: G.extras.id, option_ids: G.extras.options.map((o: any) => o.id) }]);
    expect(three.status).toBe(400);
    expect(msg(three)).toBe('You can pick up to 2 options for “Extras”.');
  });

  /** Previews, signs and sends a request with the usual choices; returns the booking id and the preview's pricing. */
  const book = async () => {
    const body = { ...fields, options: choices(), payment_method_id: 'pm_e2e_card' };
    const pv = await as('cust', http().post('/api/contracts/booking-preview')).send(body);
    expect(pv.status).toBe(201);
    await sleep(2100);
    const created = await as('cust', http().post('/api/bookings')).send({ ...body, preview_token: pv.body.data.preview_token, signature: sig('Cara Customer', pv.body.data.content_sha256) });
    expect(created.status).toBe(201);
    return { id: created.body.data.id as string, pv: pv.body.data };
  };

  /** The vendor accepts and signs (the deposit is charged now). */
  const accept = async (bid: string) => {
    const contracts = await as('vendor', http().get(`/api/contracts/booking/${bid}`));
    const hash = contracts.body.data.contracts[0].content_sha256;
    await sleep(2100);
    const res = await as('vendor', http().patch(`/api/bookings/${bid}/confirm`)).send({ signature: sig('Bee Vendor', hash) });
    expect(res.status).toBe(200);
  };

  it('prices the upcharges on the server and freezes the choices on the booking', async () => {
    const { id: bid, pv } = await book();
    bookingId = bid;
    // 10 × $45 + Knotless $20 + Beads $5 × 10 + Curled ends $10
    expect(pv.pricing).toMatchObject({ price: 530, options_amount: 80, plan: 'DEPOSIT_50' });
    expect(pv.pricing.options.map((g: any) => g.amount)).toEqual([20, 60]);
    expect(pv.body).toContain('- Customization: Style: Knotless = $20.00');
    expect(pv.body).toContain('- Customization: Extras: Beads, Curled ends (Beads +$50.00 ($5.00 × 10 guests); Curled ends +$10.00) = $60.00');
    expect(pv.body).toContain('Vendor price: $530.00');
    // half the price with the upcharges, plus the whole fee, when the vendor accepts
    expect(pv.pricing.schedule[0].amount).toBe(265 + pv.pricing.service_fee);

    const stored = await prisma.booking.findUnique({ where: { id: bid } });
    expect(Number(stored.amount)).toBe(530);
    expect(Number(stored.options_amount)).toBe(80);
    expect(stored.chosen_options.map((g: any) => [g.title, g.options.map((o: any) => [o.label, o.amount])])).toEqual([
      ['Style', [['Knotless', 20]]],
      ['Extras', [['Beads', 50], ['Curled ends', 10]]],
    ]);

    // the vendor sees what was chosen on the request
    const seen = await as('vendor', http().get(`/api/bookings/${bid}`));
    expect(seen.body.data.customizations.map((g: any) => g.title)).toEqual(['Style', 'Extras']);
    expect(seen.body.data.options_amount).toBe(80);
    expect(seen.body.data.listing.donts).toHaveLength(2);
  });

  it('editing the package’s customizations later leaves the booking as it was', async () => {
    const res = await as('vendor', http().put(`/api/vendor/listings/${L.braids}/customizations`)).send({
      groups: [{ id: G.style.id, title: 'Braid style', required: true, options: [{ id: G.style.options[0].id, label: 'Knotless (long)', price: 50 }] }],
    });
    expect(res.status).toBe(200);
    const b = await as('cust', http().get(`/api/bookings/${bookingId}`));
    expect(b.body.data.customizations[0]).toMatchObject({ title: 'Style', amount: 20, options: [expect.objectContaining({ label: 'Knotless', price: 20 })] });
    expect(b.body.data.customizations[1].title).toBe('Extras');
    expect(Number(b.body.data.amount)).toBe(530);
    // and the vendor's original list comes back for the next booking
    const back = await as('vendor', http().put(`/api/vendor/listings/${L.braids}/customizations`)).send({
      groups: [
        { id: G.style.id, title: 'Style', required: true, options: G.style.options.map((o: any) => ({ id: o.id, label: o.label, price: o.price })) },
        { title: 'Extras', max_select: 2, options: [{ label: 'Beads', price: 5, price_mode: 'PER_UNIT' }, { label: 'Curled ends', price: 10 }, { label: 'Wash', price: 15 }] },
      ],
    });
    expect(back.status).toBe(200);
    G.extras = back.body.data[1];
  });

  it('the deposit charged includes the upcharges, and so does the refund when the vendor cancels', async () => {
    await accept(bookingId);
    const deposit = await prisma.bookingInstallment.findFirst({ where: { booking_id: bookingId, sequence: 1 } });
    const fee = Number(deposit.fee_amount);
    expect(deposit.status).toBe('PAID');
    expect(Number(deposit.amount)).toBe(265 + fee);
    expect(charged.at(-1)!.amount).toBe(265 + fee);
    const balance = await prisma.bookingInstallment.findFirst({ where: { booking_id: bookingId, sequence: 2 } });
    expect(Number(balance.amount)).toBe(265);

    const cancelled = await as('vendor', http().patch(`/api/bookings/${bookingId}/cancel`)).send({ reason_code: 'emergency', reason: 'Family emergency' });
    expect(cancelled.status).toBe(200);
    // the vendor cancelled: the customer gets everything back, upcharges and fee included
    expect(refunded.find((r) => r.pi === deposit.payment_intent_id)?.amount).toBe(265 + fee);
    const after = await prisma.bookingInstallment.findUnique({ where: { id: deposit.id } });
    expect(Number(after.refunded_amount)).toBe(265 + fee);
  });

  it('the vendor is paid the package plus the upcharges, and the invoice lists them', async () => {
    const { id: bid } = await book();
    await accept(bid);
    // the balance comes due and is charged
    const balance = await prisma.bookingInstallment.findFirst({ where: { booking_id: bid, sequence: 2 } });
    await prisma.bookingInstallment.update({ where: { id: balance.id }, data: { due_at: new Date(Date.now() - 60_000) } });
    await payments.chargeInstallment(balance.id);
    const paid = await prisma.bookingInstallment.findMany({ where: { booking_id: bid, kind: 'charge' } });
    expect(paid.every((i: any) => i.status === 'PAID')).toBe(true);

    // the job happened
    await prisma.booking.update({ where: { id: bid }, data: { status: 'IN_PROGRESS', event_start_at: new Date(Date.now() - 3600e3), scheduled_at: new Date(Date.now() - 3600e3) } });
    const done = await as('vendor', http().patch(`/api/bookings/${bid}/complete`));
    expect(done.status).toBe(200);
    await payments.releaseBooking(bid);
    const b = await prisma.booking.findUnique({ where: { id: bid } });
    // the vendor's part is the whole price, upcharges included; commission comes off that
    expect(Number(b.released_gross)).toBe(530);
    const earning = await prisma.paymentTransaction.findFirst({ where: { user_id: U.vendor, type: 'booking_earning', reference_number: bid } });
    expect(Number(earning.amount)).toBe(530 - Number(b.commission_amount));

    const { InvoiceService } = await import('../src/modules/payments/invoice.service');
    const data = await app.get(InvoiceService).invoiceFor(bid, { id: U.cust });
    expect(data.price_lines.slice(0, 3)).toEqual([
      { label: 'Package: Bridal party braids ($45.00 per person × 10 guests)', amount: 450 },
      { label: 'Customization: Style: Knotless', amount: 20 },
      { label: 'Customization: Extras: Beads, Curled ends', amount: 60 },
    ]);
  });

  it('rental items carry dos and don’ts too', async () => {
    const created = await as('vendor', http().post('/api/vendor/rentals'))
      .field('title', 'Pressure washer')
      .field('description', 'Electric, 2000 psi')
      .field('daily_rate', '40')
      .field('status', 'DRAFT')
      .field('dos', JSON.stringify(['Use the cleaning tip for decks']))
      .field('donts', JSON.stringify(['Don’t point at people or pets']));
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ dos: ['Use the cleaning tip for decks'], donts: ['Don’t point at people or pets'] });
    const tooMany = await as('vendor', http().patch(`/api/vendor/rentals/${created.body.data.id}`)).field('dos', JSON.stringify(Array.from({ length: 16 }, (_, i) => `Do ${i}`)));
    expect(tooMany.status).toBe(400);
  });
});
