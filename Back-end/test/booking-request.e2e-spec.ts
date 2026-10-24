/**
 * Booking requests against a real Postgres + Redis: promo code limits, inspiration photos and the
 * customer's bookings tabs. Runs only when CONTRACTS_E2E_DATABASE_URL points at a migrated, disposable database:
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... npx jest --config ./test/jest-e2e.json booking-request --forceExit
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;
const SECRET = 'booking-request-e2e-secret';
const STORAGE = `/tmp/booking-request-e2e-${process.pid}`;

if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_booking_request_e2e';
  process.env.APP_URL = 'http://booking-request.test';
  process.env.CLIENT_APP_URL = 'http://localhost:3000';
  process.env.PRIVATE_STORAGE_DIR = STORAGE;
}

jest.setTimeout(240_000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(64)]);
const PDF = Buffer.from('%PDF-1.7 not a photo');

run('Booking requests (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  const id = randomBytes(4).toString('hex');
  const U = { vendor: `v-${id}`, cust: `c-${id}`, other: `o-${id}`, tabs: `t-${id}`, admin: `a-${id}` };
  const types: Record<string, string> = { vendor: 'VENDOR', cust: 'CUSTOMER', other: 'CUSTOMER', tabs: 'CUSTOMER', admin: 'ADMIN' };
  const T = Object.fromEntries(
    Object.entries(U).map(([k, sub]) => [k, jwt.sign({ sub, email: `${sub}@t.test`, type: types[k] }, SECRET)]),
  ) as Record<keyof typeof U, string>;
  const LISTING = `l-${id}`;
  const CODE = `FIRST${id}`.toUpperCase();

  const start = new Date(Date.now() + 40 * 86400e3);
  start.setUTCHours(22, 0, 0, 0);
  const end = new Date(start.getTime() + 6 * 3600e3);
  const full = {
    listing_id: LISTING, vendor_id: U.vendor, timezone: 'America/Chicago',
    event_start_at: start, event_end_at: end, venue_address: 'Grand Hall, Austin TX', guest_count: 80,
  };
  const sig = (hash: string) => ({ legal_name: 'Cara Customer', consent: true, content_sha256: hash, device_platform: 'web' });

  const http = () => request(app.getHttpServer());
  const msg = (res: request.Response) => res.body?.message?.message ?? res.body?.message;
  // signing endpoints are rate limited per IP
  const signing = () => sleep(2100);
  const preview = (token: string, body: any) => http().post('/api/contracts/booking-preview').auth(token, { type: 'bearer' }).send(body);
  const check = (token: string) => http().post('/api/promo/check').auth(token, { type: 'bearer' }).send({ code: CODE.toLowerCase(), price: 1000 });
  const filesFor = (bookingId: string) => {
    const dir = path.join(STORAGE, 'request-photos', bookingId);
    return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  };

  async function send(token: string, body: any, photos: Buffer[] = []) {
    const pv = await preview(token, body);
    expect(pv.status).toBe(201);
    await signing();
    const payload = { ...body, preview_token: pv.body.data.preview_token, signature: sig(pv.body.data.content_sha256) };
    if (!photos.length) return http().post('/api/bookings').auth(token, { type: 'bearer' }).send(payload);
    const req = http().post('/api/bookings/with-photos').auth(token, { type: 'bearer' }).field('request', JSON.stringify(payload));
    photos.forEach((p, i) => req.attach('photos', p, `photo-${i}.jpg`));
    return req;
  }

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module');
    const { PrismaService } = await import('../src/prisma/prisma.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.user.createMany({
      data: Object.entries(U).map(([k, uid]) => ({ id: uid, email: `${uid}@t.test`, name: `${k} user`, type: types[k] })),
    });
    await prisma.vendorProfile.create({ data: { user_id: U.vendor, business_name: 'Vera Photo LLC', address: '1 Lens Way' } });
    await prisma.vendorListing.create({ data: { id: LISTING, vendor_id: U.vendor, title: 'Wedding Photography', description: '8 hours', price: 1000, status: 'ACTIVE' } });
    const vc = await http().post('/api/vendor/contracts/default').auth(T.vendor, { type: 'bearer' }).send({
      category: 'PHOTO_VIDEO',
      field_values: {
        business_legal_name: 'Vera Photo LLC', business_address: '1 Lens Way', cancellation_policy: 'moderate',
        governing_law: 'Texas, USA', delivery_time_days: '30', revisions_included: '2', usage_rights: 'personal',
      },
    });
    expect(vc.status).toBe(201);
  });

  afterAll(async () => {
    await app?.close();
    fs.rmSync(STORAGE, { recursive: true, force: true });
  });

  let firstBooking: string;

  it('admin creates a first-booking, once-per-customer code', async () => {
    const res = await http().post('/api/admin/promos').auth(T.admin, { type: 'bearer' })
      .send({ code: CODE, amount_off: 20, once_per_customer: true, first_booking_only: true });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ once_per_customer: true, first_booking_only: true });
    const list = await http().get('/api/admin/promos').auth(T.admin, { type: 'bearer' });
    expect(list.body.data.find((p: any) => p.code === CODE)).toMatchObject({ once_per_customer: true, first_booking_only: true });
  });

  it('sends a first booking with the code and inspiration photos, stored privately', async () => {
    expect((await check(T.cust)).body.data).toEqual({ code: CODE, discount: 20 });
    const res = await send(T.cust, { ...full, promo_code: CODE }, [JPEG, JPEG]);
    expect(res.status).toBe(201);
    firstBooking = res.body.data.id;
    const b = await prisma.booking.findUnique({ where: { id: firstBooking } });
    expect(b.promo_code).toBe(CODE);
    expect(Number(b.discount)).toBe(20);
    expect(b.request_photos).toHaveLength(2);
    expect(b.request_photos.every((k: string) => k.startsWith(`request-photos/${firstBooking}/`))).toBe(true);
    expect(filesFor(firstBooking)).toHaveLength(2);
  });

  it('the vendor and the customer see the photos through signed links; others see nothing', async () => {
    for (const token of [T.vendor, T.cust]) {
      const res = await http().get(`/api/bookings/${firstBooking}`).auth(token, { type: 'bearer' });
      expect(res.body.data.request_photo_urls).toHaveLength(2);
      const url = new URL(res.body.data.request_photo_urls[0]);
      const file = await http().get(url.pathname).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toBe('image/jpeg');
      expect(Buffer.compare(file.body, JPEG)).toBe(0);
    }
    expect((await http().get(`/api/bookings/${firstBooking}`).auth(T.other, { type: 'bearer' })).status).toBe(403);
    expect((await http().get('/api/request-photos/forged.token')).status).toBe(403);
  });

  it('refuses the code a second time, with the same answer from the check and the preview', async () => {
    const pv = await preview(T.cust, { ...full, promo_code: CODE });
    expect(pv.status).toBe(400);
    expect(msg(pv)).toBe('You’ve already used this code.');
    const c = await check(T.cust);
    expect(c.status).toBe(400);
    expect(msg(c)).toBe('You’ve already used this code.');
    // someone else can still use it
    expect((await check(T.other)).status).toBe(201);
  });

  it('a declined or expired request gives the code back; one cancelled after paying does not', async () => {
    await prisma.booking.update({ where: { id: firstBooking }, data: { status: 'REJECTED', expired_at: new Date() } });
    expect((await check(T.cust)).status).toBe(201);
    await prisma.booking.update({ where: { id: firstBooking }, data: { status: 'CANCELLED', expired_at: null, paid_at: null } });
    expect((await check(T.cust)).status).toBe(201);
    await prisma.booking.update({ where: { id: firstBooking }, data: { paid_at: new Date() } });
    const c = await check(T.cust);
    expect(c.status).toBe(400);
    // paid, so the code was used
    expect(msg(c)).toBe('You’ve already used this code.');
    await prisma.booking.update({ where: { id: firstBooking }, data: { status: 'REJECTED', paid_at: null } });
  });

  it('a first-booking code is refused once the customer has another request or booking', async () => {
    // a waiting request counts too, so the code can't go on several requests at once
    const waiting = await prisma.booking.create({ data: { customer_id: U.other, vendor_id: U.vendor, status: 'PENDING' } });
    for (const res of [await check(T.other), await preview(T.other, { ...full, promo_code: CODE })]) {
      expect(res.status).toBe(400);
      expect(msg(res)).toBe('This code is for your first booking only.');
    }
    // declined: it's their first again
    await prisma.booking.update({ where: { id: waiting.id }, data: { status: 'REJECTED' } });
    expect((await check(T.other)).status).toBe(201);
    await prisma.booking.update({ where: { id: waiting.id }, data: { status: 'CONFIRMED' } });
    expect((await check(T.other)).status).toBe(400);
  });

  it('refuses a file that is not a photo without creating the booking or storing anything', async () => {
    const before = await prisma.booking.count({ where: { customer_id: U.cust } });
    const res = await send(T.cust, full, [JPEG, PDF]);
    expect(res.status).toBe(400);
    expect(msg(res)).toMatch(/JPEG, PNG, WebP or GIF/);
    expect(await prisma.booking.count({ where: { customer_id: U.cust } })).toBe(before);
    expect(fs.readdirSync(path.join(STORAGE, 'request-photos'))).toEqual([firstBooking]);
  });

  it('the same request sent twice at once leaves only the winner’s photos', async () => {
    const pv = await preview(T.cust, full);
    await signing();
    const payload = JSON.stringify({ ...full, preview_token: pv.body.data.preview_token, signature: sig(pv.body.data.content_sha256) });
    const one = () => http().post('/api/bookings/with-photos').auth(T.cust, { type: 'bearer' }).field('request', payload).attach('photos', JPEG, 'a.jpg').attach('photos', JPEG, 'b.jpg');
    const results = await Promise.all([one(), one()]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const bid = results.find((r) => r.status === 201)!.body.data.id;
    const b = await prisma.booking.findUnique({ where: { id: bid } });
    expect(filesFor(bid).sort()).toEqual(b.request_photos.map((k: string) => path.basename(k)).sort());
  });

  it('every customer booking is in exactly one tab', async () => {
    const day = 86400e3;
    const now = Date.now();
    const rows = {
      pending: { status: 'PENDING', event_start_at: new Date(now + 5 * day) },
      upcoming: { status: 'CONFIRMED', event_start_at: new Date(now + 5 * day) },
      undated: { status: 'CONFIRMED' },
      happening: { status: 'CONFIRMED', event_start_at: new Date(now - 3600e3), event_end_at: new Date(now + 3600e3) },
      started: { status: 'IN_PROGRESS', event_start_at: new Date(now - day) },
      done: { status: 'COMPLETED', event_start_at: new Date(now - 9 * day) },
      cancelled: { status: 'CANCELLED', event_start_at: new Date(now + 9 * day) },
      expired: { status: 'REJECTED', expired_at: new Date(), scheduled_at: new Date(now + 2 * day) },
    };
    const ids: Record<string, string> = {};
    for (const [k, data] of Object.entries(rows)) {
      ids[k] = (await prisma.booking.create({ data: { customer_id: U.tabs, vendor_id: U.vendor, ...data } })).id;
    }
    const tab = async (t: string) => {
      const res = await http().get(`/api/bookings/my/customer?tab=${t}&limit=50`).auth(T.tabs, { type: 'bearer' });
      expect(res.status).toBe(200);
      return res.body.data.map((b: any) => b.id);
    };
    expect(await tab('pending')).toEqual([ids.pending]);
    expect(await tab('upcoming')).toEqual([ids.upcoming, ids.undated]);
    expect((await tab('active')).sort()).toEqual([ids.happening, ids.started].sort());
    expect((await tab('complete')).sort()).toEqual([ids.done, ids.cancelled, ids.expired].sort());
    // without a tab the list is as before: everything, newest first
    const all = await http().get('/api/bookings/my/customer?limit=50').auth(T.tabs, { type: 'bearer' });
    expect(all.body.data).toHaveLength(8);
    expect(all.body.meta.total).toBe(8);
  });
});
