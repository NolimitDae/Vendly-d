/**
 * Delivery / travel fee by distance against a real Postgres + Redis: the vendor sets it on the package,
 * the customer sees it live while entering the address, the server prices it again on the request, and it
 * is part of the contract's price, the Vendly Protection fee, the deposit and the invoice. An address that
 * can't be placed on the map goes out without a fee, and the vendor adds it by suggesting changes.
 * The geocoder is stubbed (no network). Runs only when CONTRACTS_E2E_DATABASE_URL points at a migrated,
 * disposable database:
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... yarn test:e2e travel-fee
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;
const SECRET = 'travel-e2e-secret';

if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_travel_e2e';
  process.env.APP_URL = 'http://travel.test';
  process.env.CLIENT_APP_URL = 'http://localhost:3000';
  process.env.PRIVATE_STORAGE_DIR = `/tmp/travel-e2e-${process.pid}`;
}

jest.setTimeout(240_000);

const SIGNATURE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAiElEQVR42u2XWwrAMAgEc/9L2xOEYh67G5iBfFbHVMSMAQAAAHCfmhy3k61w9yVIclfjuLpRVrxVxpGvk0QlFVm8Ui62eIXgNHaFtdjpTviNdypZvRor/a9JvHaS3Rxe0nmyUkjq5F726nyoXGCkO0X69ibxSt/fJV7JLziZV+IbPtkLAADgJT6abb9BSgfpowAAAABJRU5ErkJggg==';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = 86400e3;
const round2 = (n: number) => Math.round(n * 100) / 100;

// the package is in Austin; addresses are placed due north of it, so the distances are exact
const AUSTIN = { lat: 30.2672, lng: -97.7431 };
const MILES_PER_DEGREE = (3958.8 * Math.PI) / 180;
const north = (miles: number) => ({ lat: AUSTIN.lat + miles / MILES_PER_DEGREE, lng: AUSTIN.lng });
const FAR = '100 Far St, Round Rock, TX 78664'; // 25 miles in a straight line: 30.0 road miles
const NEAR = '5 Near Ave, Austin, TX 78701'; // 5 miles: inside the free miles
const LOST = 'Behind the old barn somewhere';
const PLACES: Record<string, { lat: number; lng: number } | null> = { [FAR]: north(25), [NEAR]: north(5), [LOST]: null };

run('Delivery / travel fee (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  const id = randomBytes(4).toString('hex');
  const U = { vendor: `tv-${id}`, cust: `tc-${id}` };
  const types: Record<string, string> = { vendor: 'VENDOR', cust: 'CUSTOMER' };
  const T = Object.fromEntries(Object.entries(U).map(([k, sub]) => [k, jwt.sign({ sub, email: `${sub}@t.test`, type: types[k] }, SECRET)])) as Record<keyof typeof U, string>;
  const L = { dj: `ld-${id}`, studio: `ls-${id}` };

  const start = new Date(Date.now() + 40 * DAY);
  start.setUTCHours(16, 0, 0, 0);
  const end = new Date(start.getTime() + 4 * 3600e3);
  const fields = (address: string) => ({ listing_id: L.dj, vendor_id: U.vendor, timezone: 'America/Chicago', event_start_at: start, event_end_at: end, venue_address: address, payment_method_id: 'pm_e2e_card' });
  const sig = (name: string, hash: string) => ({ legal_name: name, consent: true, content_sha256: hash, device_platform: 'web', signature_image: SIGNATURE_PNG });
  const http = () => request(app.getHttpServer());
  const as = (who: keyof typeof U, r: request.Test) => r.auth(T[who], { type: 'bearer' });
  const msg = (res: request.Response) => res.body?.message?.message ?? res.body?.message;

  const charged: { amount: number; pi: string }[] = [];
  let lookups: string[] = [];

  beforeAll(async () => {
    const { StripePayment } = await import('../src/common/lib/Payment/stripe/StripePayment');
    let n = 0;
    jest.spyOn(StripePayment, 'chargeSavedCard').mockImplementation(async (o: any) => {
      const pi = `pi_travel_${id}_${++n}`;
      charged.push({ amount: o.amount, pi });
      return { id: pi, status: 'succeeded' } as any;
    });
    jest.spyOn(StripePayment, 'retrievePaymentMethod').mockResolvedValue({ card: { brand: 'visa', last4: '4242' } } as any);
    // the geocoder: these addresses only, and nothing in the background
    const { GeocodeService } = await import('../src/modules/geo/geocode.service');
    jest.spyOn(GeocodeService.prototype, 'point').mockImplementation(async (a: string) => {
      lookups.push(a);
      return PLACES[a] ?? null;
    });
    jest.spyOn(GeocodeService.prototype, 'booking').mockResolvedValue(undefined);
    jest.spyOn(GeocodeService.prototype, 'listing').mockResolvedValue(undefined);

    const { AppModule } = await import('../src/app.module');
    const { PrismaService } = await import('../src/prisma/prisma.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.user.createMany({
      data: Object.entries(U).map(([k, uid]) => ({ id: uid, email: `${uid}@t.test`, name: `${k} user`, type: types[k], ...(k === 'cust' ? { billing_id: `cus_${id}` } : {}) })),
    });
    await prisma.vendorProfile.create({ data: { user_id: U.vendor, business_name: 'Mile High DJs', address: '1 Studio Way' } });
    // a DJ who goes to the customer, $500 on a 50% deposit; and a studio session the customer comes to
    await prisma.vendorListing.create({
      data: { id: L.dj, vendor_id: U.vendor, title: 'Party DJ', description: 'Four hours of music', price: 500, payment_plan: 'DEPOSIT_50', status: 'ACTIVE', location: 'Austin, TX', ...AUSTIN, geocoded_at: new Date(), service_radius_miles: 20 },
    });
    await prisma.vendorListing.create({
      data: { id: L.studio, vendor_id: U.vendor, title: 'Studio session', description: 'At our studio', price: 200, status: 'ACTIVE', location: 'Austin, TX', ...AUSTIN, service_at: 'VENDOR_LOCATION', travel_fee_enabled: true, travel_per_mile: 2 },
    });
    const contract = await as('vendor', http().post('/api/vendor/contracts/default')).send({
      category: 'PHOTO_VIDEO',
      field_values: { business_legal_name: 'Mile High DJs LLC', business_address: '1 Studio Way', cancellation_policy: 'moderate', governing_law: 'Texas, USA', delivery_time_days: '1', revisions_included: '0', usage_rights: 'personal' },
    });
    expect(contract.status).toBe(201);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  it('the vendor sets the travel fee on the package, checked on the server', async () => {
    const patch = () => as('vendor', http().patch(`/api/vendor/listings/${L.dj}`));
    const tooDear = await patch().field('travel_fee_enabled', 'true').field('travel_per_mile', '60');
    expect(tooDear.status).toBe(400);
    expect(JSON.stringify(tooDear.body)).toMatch(/up to \$50/);
    const free = await patch().field('travel_fee_enabled', 'true').field('travel_free_miles', '15');
    expect(free.status).toBe(400);
    expect(msg(free)).toBe('Set a price per mile or a base fee, or turn the travel fee off.');

    const res = await patch().field('travel_fee_enabled', 'true').field('travel_free_miles', '15').field('travel_per_mile', '2').field('travel_round_trip', 'false');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ travel_fee_enabled: true, travel_free_miles: 15, travel_round_trip: false });
    expect(Number(res.body.data.travel_per_mile)).toBe(2);

    // customers see the rates on the package
    const page = await http().get(`/api/marketplace/listings/${L.dj}`);
    expect(page.body.data.travel_fee).toMatchObject({ free_miles: 15, per_mile: 2, text: 'Free within 15 miles, then $2.00 a mile (miles counted one way)' });
    const studio = await http().get(`/api/marketplace/listings/${L.studio}`);
    expect(studio.body.data.travel_fee).toBeNull();
  });

  it('shows the distance and fee live while the customer enters the address', async () => {
    const quote = (listing: string, address?: string) => as('cust', http().get('/api/contracts/travel-fee').query({ listing_id: listing, ...(address ? { address } : {}) }));
    expect((await http().get('/api/contracts/travel-fee').query({ listing_id: L.dj })).status).toBe(401);

    const none = await quote(L.dj);
    expect(none.body.data).toMatchObject({ applies: true, status: 'UNPRICED', fee: null, message: null, terms_text: expect.stringContaining('Free within 15 miles') });
    const far = await quote(L.dj, FAR);
    // 25 miles in a straight line, +20%: 30.0 miles; 15 free, 15 × $2.00. Past the vendor's 20 mile radius
    expect(far.body.data).toMatchObject({ applies: true, status: 'PRICED', one_way_miles: 30, miles: 30, chargeable_miles: 15, fee: 30, outside_area: true });
    expect(far.body.data.message).toMatch(/further than the vendor usually travels/);
    await sleep(1100);
    expect((await quote(L.dj, NEAR)).body.data).toMatchObject({ status: 'PRICED', miles: 6, fee: 0 });
    const lost = await quote(L.dj, LOST);
    expect(lost.body.data).toMatchObject({ status: 'UNPRICED', fee: null });
    expect(lost.body.data.message).toMatch(/couldn’t place this address on the map/);
    // the customer comes to the studio: no travel fee
    expect((await quote(L.studio, FAR)).body.data).toEqual({ applies: false });
  });

  let bookingId = '';

  it('the request is priced on the server: the fee is in the contract, the price and the Vendly Protection fee', async () => {
    lookups = [];
    const pv = await as('cust', http().post('/api/contracts/booking-preview')).send(fields(FAR));
    expect(pv.status).toBe(201);
    const d = pv.body.data;
    expect(d.pricing).toMatchObject({ price: 530, travel: { status: 'PRICED', fee: 30, miles: 30 }, plan: 'DEPOSIT_50' });
    expect(d.body).toContain('- Package: $500.00');
    expect(d.body).toContain('- Travel fee: 30.0 miles one way, first 15 free: 15.0 × $2.00 = $30.00');
    expect(d.body).toContain('Vendor price: $530.00');
    // the contract's general travel term points at the package's
    expect(d.body).toContain("- Travel fee: Free within 15 miles, then $2.00 a mile (miles counted one way). This booking's travel fee is in Schedule A.");
    // the deposit: half the price with the travel fee, plus the whole Vendly Protection fee (worked out on $530)
    expect(d.pricing.schedule[0].amount).toBe(round2(265 + d.pricing.service_fee));
    expect(lookups).toEqual([FAR]);

    // a number from the app is never taken
    await sleep(1100);
    const sneaky = await as('cust', http().post('/api/bookings')).send({ ...fields(FAR), travel_fee: 0, preview_token: d.preview_token, signature: sig('Cara Customer', d.content_sha256) });
    expect(sneaky.status).toBe(400);
    // a different address than the one reviewed is placed again, and the contract no longer matches
    await sleep(1100);
    const moved = await as('cust', http().post('/api/bookings')).send({ ...fields(NEAR), preview_token: d.preview_token, signature: sig('Cara Customer', d.content_sha256) });
    expect(moved.status).toBe(409);

    lookups = [];
    await sleep(1100);
    const created = await as('cust', http().post('/api/bookings')).send({ ...fields(FAR), preview_token: d.preview_token, signature: sig('Cara Customer', d.content_sha256) });
    expect(created.status).toBe(201);
    // priced on the position the preview found (from its signed token), without asking the geocoder again
    expect(lookups).toEqual([]);
    bookingId = created.body.data.id;
    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(Number(b.amount)).toBe(530);
    expect(Number(b.travel_fee)).toBe(30);
    expect(Number(b.service_fee)).toBe(d.pricing.service_fee);
    expect(b.travel_details).toMatchObject({ status: 'PRICED', miles: 30, terms: { free_miles: 15, per_mile: 2, base_fee: 0, round_trip: false } });

    // both sides see it on the booking
    for (const who of ['vendor', 'cust'] as const) {
      const seen = await as(who, http().get(`/api/bookings/${bookingId}`));
      expect(seen.body.data).toMatchObject({ travel_fee: 30, travel: { status: 'PRICED', label: '30.0 miles one way, first 15 free: 15.0 × $2.00' } });
      expect(seen.body.data.travel_details).toBeUndefined();
    }
  });

  it('a later package edit leaves the booking alone, and the deposit and invoice include the fee', async () => {
    await as('vendor', http().patch(`/api/vendor/listings/${L.dj}`)).field('travel_per_mile', '5').expect(200);
    const contracts = await as('vendor', http().get(`/api/contracts/booking/${bookingId}`));
    await sleep(1100);
    const accepted = await as('vendor', http().patch(`/api/bookings/${bookingId}/confirm`)).send({ signature: sig('Vic Vendor', contracts.body.data.contracts[0].content_sha256) });
    expect(accepted.status).toBe(200);
    const deposit = await prisma.bookingInstallment.findFirst({ where: { booking_id: bookingId, sequence: 1 } });
    expect(deposit.status).toBe('PAID');
    expect(Number(deposit.amount)).toBe(round2(265 + Number(deposit.fee_amount)));
    expect(charged.at(-1)!.amount).toBe(Number(deposit.amount));
    const balance = await prisma.bookingInstallment.findFirst({ where: { booking_id: bookingId, sequence: 2 } });
    expect(Number(balance.amount)).toBe(265);

    const { InvoiceService } = await import('../src/modules/payments/invoice.service');
    const inv = await app.get(InvoiceService).invoiceFor(bookingId, { id: U.cust });
    expect(inv.price_lines.slice(0, 2)).toEqual([
      { label: 'Package: Party DJ', amount: 500 },
      { label: 'Travel fee', amount: 30 },
    ]);
    await as('vendor', http().patch(`/api/vendor/listings/${L.dj}`)).field('travel_per_mile', '2').expect(200);
  });

  it('an address that can’t be placed goes out without a fee, and the vendor adds it with suggested changes', async () => {
    const pv = await as('cust', http().post('/api/contracts/booking-preview')).send(fields(LOST));
    expect(pv.status).toBe(201);
    expect(pv.body.data.pricing).toMatchObject({ price: 500, travel: { status: 'UNPRICED', fee: null } });
    expect(pv.body.data.pricing.travel.message).toMatch(/vendor can add it before they accept/);
    expect(pv.body.data.body).toContain("- Travel fee: not worked out yet (the address couldn't be placed on the map).");
    await sleep(1100);
    const created = await as('cust', http().post('/api/bookings')).send({ ...fields(LOST), preview_token: pv.body.data.preview_token, signature: sig('Cara Customer', pv.body.data.content_sha256) });
    expect(created.status).toBe(201);
    const bid = created.body.data.id;
    const b = await prisma.booking.findUnique({ where: { id: bid } });
    expect(Number(b.amount)).toBe(500);
    expect(b.travel_fee).toBeNull();
    expect(b.travel_details.status).toBe('UNPRICED');

    const state = await as('vendor', http().get(`/api/bookings/${bid}/changes`));
    expect(state.body.data.editor.current).toMatchObject({ price: 500, package: { amount: 500 }, travel: { status: 'UNPRICED', fee: null } });

    const pvc = await as('vendor', http().post(`/api/bookings/${bid}/changes/preview`)).send({ travel_fee: 45 });
    expect(pvc.status).toBe(201);
    expect(pvc.body.data.after).toMatchObject({ price: 545, package: { amount: 500 }, travel: { status: 'VENDOR', fee: 45, label: 'set by the vendor' } });
    expect(pvc.body.data.changes).toEqual(['Travel fee: $45.00']);
    expect(pvc.body.data.body).toContain('- Travel fee: set by the vendor = $45.00');
    await sleep(1100);
    const sent = await as('vendor', http().post(`/api/bookings/${bid}/changes`)).send({ travel_fee: 45, signature: sig('Vic Vendor', pvc.body.data.content_sha256) });
    expect(sent.status).toBe(201);
    await sleep(1100);
    const ok = await as('cust', http().post(`/api/bookings/${bid}/changes/approve`)).send({ signature: sig('Cara Customer', pvc.body.data.content_sha256) });
    expect(ok.status).toBe(201);

    const after = await prisma.booking.findUnique({ where: { id: bid } });
    expect(Number(after.amount)).toBe(545);
    expect(Number(after.travel_fee)).toBe(45);
    expect(after.travel_details).toMatchObject({ status: 'VENDOR', fee: 45 });
    // the next suggestion starts from the agreed fee, and the package keeps its own price
    const again = await as('vendor', http().get(`/api/bookings/${bid}/changes`));
    expect(again.body.data.editor.current).toMatchObject({ price: 545, package: { amount: 500 }, travel: { fee: 45 } });

    const contracts = await as('vendor', http().get(`/api/contracts/booking/${bid}`));
    const current = contracts.body.data.contracts.find((c: any) => c.status === 'AWAITING_VENDOR');
    await sleep(1100);
    const accepted = await as('vendor', http().patch(`/api/bookings/${bid}/confirm`)).send({ signature: sig('Vic Vendor', current.content_sha256) });
    expect(accepted.status).toBe(200);
    const deposit = await prisma.bookingInstallment.findFirst({ where: { booking_id: bid, sequence: 1 } });
    expect(Number(deposit.amount)).toBe(round2(272.5 + Number(deposit.fee_amount)));
  });

  it('a booking with no travel fee can’t have one suggested', async () => {
    // the studio: the customer comes to the vendor
    const pv = await as('cust', http().post('/api/contracts/booking-preview')).send({ ...fields(FAR), listing_id: L.studio });
    expect(pv.status).toBe(201);
    expect(pv.body.data.pricing.travel).toBeNull();
    // the contract's own travel term stays as the vendor wrote it, and there's no Schedule A line
    expect(pv.body.data.body).toContain('- Travel fee: Not specified');
    expect(pv.body.data.body).not.toContain('Schedule A');
    await sleep(1100);
    const created = await as('cust', http().post('/api/bookings')).send({ ...fields(FAR), listing_id: L.studio, preview_token: pv.body.data.preview_token, signature: sig('Cara Customer', pv.body.data.content_sha256) });
    expect(created.status).toBe(201);
    const res = await as('vendor', http().post(`/api/bookings/${created.body.data.id}/changes/preview`)).send({ travel_fee: 20 });
    expect(res.status).toBe(400);
    expect(msg(res)).toBe('This booking has no travel fee. Add a fee instead.');
  });
});
