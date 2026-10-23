/**
 * Add-ons, fees and per-person pricing against a real Postgres + Redis.
 * Runs only when CONTRACTS_E2E_DATABASE_URL points at a migrated, disposable database:
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... yarn test:e2e addons
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;
const SECRET = 'addons-e2e-secret';

if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_addons_e2e';
  process.env.APP_URL = 'http://addons.test';
  process.env.CLIENT_APP_URL = 'http://localhost:3000';
  process.env.PRIVATE_STORAGE_DIR = `/tmp/addons-e2e-${process.pid}`;
}

jest.setTimeout(240_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

run('Add-ons and fees (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  const id = randomBytes(4).toString('hex');
  const U = { vendor: `av-${id}`, other: `ao-${id}`, cust: `ac-${id}`, admin: `aa-${id}` };
  const types: Record<string, string> = { vendor: 'VENDOR', other: 'VENDOR', cust: 'CUSTOMER', admin: 'ADMIN' };
  const T = Object.fromEntries(Object.entries(U).map(([k, sub]) => [k, jwt.sign({ sub, email: `${sub}@t.test`, type: types[k] }, SECRET)])) as Record<keyof typeof U, string>;
  const L = { catering: `lc-${id}`, other: `lo-${id}` };

  const start = new Date(Date.now() + 40 * 86400e3);
  start.setUTCHours(22, 0, 0, 0);
  const end = new Date(start.getTime() + 5 * 3600e3);
  const fields = {
    listing_id: L.catering, vendor_id: U.vendor, timezone: 'America/Chicago', event_start_at: start, event_end_at: end,
    venue_address: 'Grand Hall, Austin TX', guest_count: 120,
  };
  const sig = (hash: string) => ({ legal_name: 'Carl Customer', consent: true, content_sha256: hash, device_platform: 'web' });
  const http = () => request(app.getHttpServer());
  const msg = (res: request.Response) => res.body?.message?.message ?? res.body?.message;

  const addOn: Record<string, string> = {};
  let bookingId: string;

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
    await prisma.vendorProfile.create({ data: { user_id: U.vendor, business_name: 'Vee Catering', address: '1 Oven Way' } });
    await prisma.vendorListing.createMany({
      data: [
        { id: L.catering, vendor_id: U.vendor, title: 'Wedding buffet', description: 'Three courses', price: 45, price_unit: 'person', min_quantity: 50, max_quantity: 300, status: 'ACTIVE' },
        { id: L.other, vendor_id: U.other, title: 'Someone else', description: 'x', price: 100, status: 'ACTIVE' },
      ],
    });
    const contract = await http().post('/api/vendor/contracts/default').auth(T.vendor, { type: 'bearer' }).send({
      category: 'PHOTO_VIDEO',
      field_values: { business_legal_name: 'Vee Catering LLC', business_address: '1 Oven Way', cancellation_policy: 'moderate', governing_law: 'Texas, USA', delivery_time_days: '1', revisions_included: '0', usage_rights: 'personal' },
    });
    expect(contract.status).toBe(201);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('vendor builds a library of add-ons and fees and bulk adds them to a package', async () => {
    const make = async (body: any) => {
      const res = await http().post('/api/vendor/add-ons').auth(T.vendor, { type: 'bearer' }).send(body);
      expect(res.status).toBe(201);
      return res.body.data.id as string;
    };
    addOn.dessert = await make({ name: 'Dessert table', price: 6, price_unit: 'PER_PERSON' });
    addOn.chair = await make({ name: 'Extra chair', price: 4, price_unit: 'PER_ITEM', max_quantity: 100 });
    addOn.late = await make({ kind: 'FEE', name: 'Late return', price: 50, price_unit: 'PER_HOUR', description: 'Rented items back after the agreed time' });

    const attach = await http().post('/api/vendor/add-ons/attach').auth(T.vendor, { type: 'bearer' })
      .send({ add_on_ids: [addOn.dessert, addOn.chair, addOn.late], listing_ids: [L.catering] });
    expect(attach.status).toBe(201);
    expect(attach.body.data.added).toBe(3);

    // a custom add-on made inside the package form belongs to that package only
    addOn.custom = await make({ name: 'Signature cocktail', price: 300, in_library: false, listing_ids: [L.catering] });
    const lib = await http().get('/api/vendor/add-ons').auth(T.vendor, { type: 'bearer' });
    expect(lib.body.data.map((a: any) => a.id)).not.toContain(addOn.custom);
    const forPkg = await http().get(`/api/vendor/add-ons?listing_id=${L.catering}`).auth(T.vendor, { type: 'bearer' });
    expect(forPkg.body.data.map((a: any) => a.id)).toContain(addOn.custom);
  });

  it('refuses another vendor’s packages and add-ons', async () => {
    const res = await http().post('/api/vendor/add-ons/attach').auth(T.vendor, { type: 'bearer' }).send({ add_on_ids: [addOn.dessert], listing_ids: [L.other] });
    expect(res.status).toBe(403);
    const theirs = await http().patch(`/api/vendor/add-ons/${addOn.dessert}`).auth(T.other, { type: 'bearer' }).send({ price: 1 });
    expect(theirs.status).toBe(404);
  });

  it('customers see the add-ons, the fees and the per person price on the package', async () => {
    const res = await http().get(`/api/marketplace/listings/${L.catering}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ price_unit: 'person', min_quantity: 50, max_quantity: 300 });
    expect(res.body.data.add_ons.map((a: any) => a.name)).toEqual(expect.arrayContaining(['Dessert table', 'Extra chair', 'Signature cocktail']));
    expect(res.body.data.fees).toEqual([expect.objectContaining({ name: 'Late return', price_text: '$50.00 per hour' })]);
  });

  it('prices the booking per guest plus the add-ons, and the contract shows how', async () => {
    const tooFew = await http().post('/api/contracts/booking-preview').auth(T.cust, { type: 'bearer' }).send({ ...fields, guest_count: 20 });
    expect(tooFew.status).toBe(400);
    expect(msg(tooFew)).toMatch(/at least 50 guests/);

    const notOffered = await http().post('/api/contracts/booking-preview').auth(T.cust, { type: 'bearer' }).send({ ...fields, add_ons: [{ add_on_id: addOn.late }] });
    expect(notOffered.status).toBe(400);

    const body = { ...fields, add_ons: [{ add_on_id: addOn.dessert }, { add_on_id: addOn.chair, quantity: 10 }] };
    const pv = await http().post('/api/contracts/booking-preview').auth(T.cust, { type: 'bearer' }).send(body);
    expect(pv.status).toBe(201);
    const p = pv.body.data.pricing;
    // 120 × $45 + 120 × $6 + 10 × $4
    expect(p.price).toBe(6160);
    expect(p.package).toMatchObject({ quantity: 120, amount: 5400 });
    expect(p.add_ons.map((a: any) => a.amount)).toEqual([720, 40]);
    expect(pv.body.data.body).toContain('Schedule A: Price at booking');
    expect(pv.body.data.body).toContain('$45.00 per person × 120 guests = $5,400.00');
    expect(pv.body.data.body).toContain('Late return: $50.00 per hour');
    expect(pv.body.data.body).toContain('Vendor price: $6,160.00');

    await sleep(2100);
    const created = await http().post('/api/bookings').auth(T.cust, { type: 'bearer' })
      .send({ ...body, preview_token: pv.body.data.preview_token, signature: sig(pv.body.data.content_sha256) });
    expect(created.status).toBe(201);
    bookingId = created.body.data.id;
    const stored = await prisma.booking.findUnique({ where: { id: bookingId }, include: { extras: true } });
    expect(Number(stored.amount)).toBe(6160);
    expect(stored.extras).toHaveLength(2);
    expect(stored.extras.every((e: any) => e.status === 'INCLUDED')).toBe(true);
  });

  it('a fee after the job: sent, declined, sent to Vendly, decided', async () => {
    // the job has started
    await prisma.booking.update({ where: { id: bookingId }, data: { status: 'IN_PROGRESS' } });

    const early = await http().post(`/api/bookings/${bookingId}/extras`).auth(T.cust, { type: 'bearer' }).send({ kind: 'FEE', name: 'Cleaning', unit_price: 80 });
    expect(early.status).toBe(403);

    const sent = await http().post(`/api/bookings/${bookingId}/extras`).auth(T.vendor, { type: 'bearer' })
      .send({ kind: 'FEE', add_on_id: addOn.late, quantity: 2, note: 'Chafing dishes came back 2 hours late' });
    expect(sent.status).toBe(201);
    expect(sent.body.data).toMatchObject({ status: 'PENDING', amount: 100, fee_amount: 0, total: 100 });
    const extraId = sent.body.data.id;

    const seen = await http().get(`/api/bookings/${bookingId}/extras`).auth(T.cust, { type: 'bearer' });
    expect(seen.body.meta).toMatchObject({ waiting_on_customer: 1, waiting_total: 100 });
    const stranger = await http().get(`/api/bookings/${bookingId}/extras`).auth(T.other, { type: 'bearer' });
    expect(stranger.status).toBe(403);

    const tooSoon = await http().post(`/api/booking-extras/${extraId}/escalate`).auth(T.vendor, { type: 'bearer' }).send({ note: 'They have not answered yet' });
    expect(tooSoon.status).toBe(400);

    const declined = await http().post(`/api/booking-extras/${extraId}/decline`).auth(T.cust, { type: 'bearer' }).send({ reason: 'They were back on time' });
    expect(declined.status).toBe(201);

    const escalated = await http().post(`/api/booking-extras/${extraId}/escalate`).auth(T.vendor, { type: 'bearer' }).send({ note: 'Return time is in the contract; photos uploaded as proof.' });
    expect(escalated.status).toBe(201);

    const notAdmin = await http().get('/api/admin/booking-extras').auth(T.vendor, { type: 'bearer' });
    expect(notAdmin.status).toBe(403);
    const queue = await http().get('/api/admin/booking-extras').auth(T.admin, { type: 'bearer' });
    expect(queue.body.data.map((e: any) => e.id)).toContain(extraId);

    const waived = await http().post(`/api/admin/booking-extras/${extraId}/review`).auth(T.admin, { type: 'bearer' }).send({ action: 'waive', note: 'The return log shows on time' });
    expect(waived.status).toBe(201);
    const after = await prisma.bookingExtra.findUnique({ where: { id: extraId } });
    expect(after.status).toBe('WAIVED');
  });

  it('an add-on that adds time moves the end once approved; a declined one does not', async () => {
    await prisma.booking.update({ where: { id: bookingId }, data: { payment_method_id: 'pm_e2e_card' } });
    const before = (await prisma.booking.findUnique({ where: { id: bookingId } })).event_end_at as Date;

    // requests are throttled (3 per 10 s per vendor)
    await sleep(10_500);
    const sent = await http().post(`/api/bookings/${bookingId}/extras`).auth(T.vendor, { type: 'bearer' })
      .send({ kind: 'ADD_ON', name: 'Two more hours', unit_price: 150, price_unit: 'PER_HOUR', quantity: 2, extends_minutes: 120 });
    expect(sent.status).toBe(201);
    expect(sent.body.data).toMatchObject({ extends_minutes: 120, extends_label: 'Adds 2 hours' });

    const declinedOne = await http().post(`/api/bookings/${bookingId}/extras`).auth(T.vendor, { type: 'bearer' }).send({ kind: 'ADD_ON', name: 'Late night set', unit_price: 300, extends_minutes: 60 });
    expect(declinedOne.status).toBe(201);
    expect((await http().post(`/api/booking-extras/${declinedOne.body.data.id}/decline`).auth(T.cust, { type: 'bearer' }).send({ reason: 'Too late for us' })).status).toBe(201);
    expect(((await prisma.booking.findUnique({ where: { id: bookingId } })).event_end_at as Date).getTime()).toBe(before.getTime());

    // the card charge fails here (no Stripe customer), but the customer agreed to the time
    const approved = await http().post(`/api/booking-extras/${sent.body.data.id}/approve`).auth(T.cust, { type: 'bearer' }).send({});
    expect(approved.status).toBe(201);
    const after = (await prisma.booking.findUnique({ where: { id: bookingId } })).event_end_at as Date;
    expect(after.getTime() - before.getTime()).toBe(120 * 60_000);
    const again = await http().post(`/api/booking-extras/${sent.body.data.id}/approve`).auth(T.cust, { type: 'bearer' }).send({});
    expect(again.status).toBe(400);
    expect(((await prisma.booking.findUnique({ where: { id: bookingId } })).event_end_at as Date).getTime()).toBe(after.getTime());

    const listed = await http().get(`/api/bookings/${bookingId}/extras`).auth(T.vendor, { type: 'bearer' });
    expect(new Date(listed.body.meta.event_end_at).getTime()).toBe(after.getTime());
    await sleep(10_500);
  });

  it('dropping a custom add-on from its package deletes it; library ones stay', async () => {
    const res = await http().put(`/api/vendor/add-ons/listing/${L.catering}`).auth(T.vendor, { type: 'bearer' }).send({ add_on_ids: [addOn.late, addOn.dessert] });
    expect(res.status).toBe(200);
    expect(res.body.data.add_ons.map((a: any) => a.id)).toEqual([addOn.dessert]);
    expect((await prisma.vendorAddOn.findUnique({ where: { id: addOn.custom } })).deleted_at).not.toBeNull();
    expect((await prisma.vendorAddOn.findUnique({ where: { id: addOn.chair } })).deleted_at).toBeNull();
  });

  it('cancelling the booking cancels requests still waiting', async () => {
    const sent = await http().post(`/api/bookings/${bookingId}/extras`).auth(T.vendor, { type: 'bearer' }).send({ kind: 'ADD_ON', name: 'Extra hour of service', unit_price: 200 });
    expect(sent.status).toBe(201);
    const cancelled = await http().patch(`/api/bookings/${bookingId}/cancel`).auth(T.vendor, { type: 'bearer' }).send({ reason: 'Emergency' });
    expect(cancelled.status).toBe(200);
    expect((await prisma.bookingExtra.findUnique({ where: { id: sent.body.data.id } })).status).toBe('CANCELLED');
  });
});
