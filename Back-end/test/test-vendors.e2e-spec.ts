/**
 * Admin -> Settings -> Test vendors against a real Postgres + Redis: create them, find them in
 * marketplace search with the "Test" flag, sign in as one with the shared password, run it again
 * (nothing new), then remove them (an open booking is cancelled first, leftover balances wiped).
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... yarn test:e2e test-vendors
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;
const SECRET = 'test-vendors-e2e-secret';
const STORAGE = `/tmp/test-vendors-e2e-${process.pid}`;

if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_test_vendors_e2e';
  process.env.APP_URL = 'http://test-vendors.test';
  process.env.CLIENT_APP_URL = 'http://localhost:3000';
}

jest.setTimeout(300_000);

run('Test vendors (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  const id = randomBytes(4).toString('hex');
  const U = { admin: `tva-${id}`, customer: `tvc-${id}` };
  const token = (uid: string, type: string) => jwt.sign({ sub: uid, email: `${uid}@t.test`, type }, SECRET);
  const http = () => request(app.getHttpServer());
  const asAdmin = (r: request.Test) => r.auth(token(U.admin, 'ADMIN'), { type: 'bearer' });
  const ATLANTA = { near: 'Atlanta, GA', lat: 33.749, lng: -84.388 };
  let password: string;

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module');
    const { PrismaService } = await import('../src/prisma/prisma.service');
    const { TanvirStorage } = await import('../src/common/lib/Disk/TanvirStorage');
    TanvirStorage.config({ driver: 'local', connection: { rootUrl: STORAGE, publicUrl: 'http://test-vendors.test/storage' } });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.createMany({
      data: [
        { id: U.admin, email: `${U.admin}@t.test`, name: 'Admin', type: 'ADMIN', email_verified_at: new Date() },
        { id: U.customer, email: `${U.customer}@t.test`, name: 'Customer', type: 'CUSTOMER', email_verified_at: new Date() },
      ],
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.booking.deleteMany({ where: { customer_id: U.customer } });
      await prisma.notification.deleteMany({ where: { receiver_id: { in: Object.values(U) } } });
      await prisma.user.deleteMany({ where: { id: { in: Object.values(U) } } });
    }
    await app?.close();
  });

  it('is admin only', async () => {
    await http().post('/api/admin/test-data').auth(token(U.customer, 'CUSTOMER'), { type: 'bearer' }).send(ATLANTA).expect(403);
    await http().delete('/api/admin/test-data').auth(token(U.customer, 'CUSTOMER'), { type: 'bearer' }).expect(403);
    await asAdmin(http().post('/api/admin/test-data').send({ near: '' })).expect(400);
  });

  it('creates test vendors for every category, with live packages that show in search marked as test', async () => {
    const categories = await prisma.serviceCategory.count();
    const res = await asAdmin(http().post('/api/admin/test-data').send(ATLANTA)).expect(201);
    password = res.body.data.password;
    expect(password).toMatch(/^[\w]{4}-[\w]{4}-[\w]{4}-[\w]{4}$/);
    const emails = res.body.data.accounts.map((a: any) => a.email);
    expect(emails.length).toBeGreaterThanOrEqual(categories);
    expect(emails).toEqual(expect.arrayContaining(['test-catering-food-1@vendly.test', 'test-catering-food-2@vendly.test', 'test-venues-1@vendly.test']));
    expect(res.body.data.skipped).toEqual([]);
    expect(res.body.data.timezone).toBe('America/New_York');

    const vendor = await prisma.user.findFirst({ where: { email: 'test-catering-food-1@vendly.test' }, include: { vendorProfile: true } });
    expect(vendor).toMatchObject({ is_test: true, type: 'VENDOR' });
    expect(vendor.password).not.toContain(password);
    expect(vendor.vendorProfile.license_status).toBe('APPROVED');
    expect(await prisma.vendorContract.count({ where: { vendor_id: vendor.id, status: 'ACTIVE' } })).toBe(1);

    const catering = await prisma.serviceCategory.findFirst({ where: { name: 'Catering & Food' } });
    const search = await http().get(`/api/marketplace/listings?category_id=${catering.id}&near_lat=33.75&near_lng=-84.39&limit=50`).expect(200);
    const mine = search.body.data.filter((l: any) => l.vendor_id === vendor.id);
    expect(mine.map((l: any) => l.title).sort()).toEqual(['Plated Three-Course Dinner', 'Southern Buffet Dinner']);
    expect(mine.every((l: any) => l.is_test === true && l.distance_miles < 10)).toBe(true);
    // search matches word by word across title, place, category and vendor name
    const words = await http().get(`/api/marketplace/listings?q=${encodeURIComponent('buffet atlanta')}&limit=50`).expect(200);
    expect(words.body.data.map((l: any) => l.title)).toContain('Southern Buffet Dinner');
    const byVendor = await http().get(`/api/marketplace/listings?q=${encodeURIComponent(vendor.vendorProfile.business_name)}&limit=50`).expect(200);
    expect(byVendor.body.data.some((l: any) => l.vendor_id === vendor.id)).toBe(true);
    // a typed place that can't be looked up matches by its words ("Atlanta GA" in "Atlanta, GA")
    process.env.GEOCODER_URL = 'http://127.0.0.1:9';
    const place = await http().get(`/api/marketplace/listings?category_id=${catering.id}&location=${encodeURIComponent('Atlanta GA')}&limit=50`).expect(200);
    delete process.env.GEOCODER_URL;
    expect(place.body.data.filter((l: any) => l.vendor_id === vendor.id)).toHaveLength(2);
    // the photo is stored like any upload
    const file = decodeURIComponent(new URL(mine[0].images[0]).pathname.split('/').pop()!);
    expect(existsSync(`${STORAGE}/listings/${file}`)).toBe(true);

    const page = await http().get(`/api/marketplace/listings/${mine[0].id}`).expect(200);
    expect(page.body.data).toMatchObject({ is_test: true, cancellation_policy: { key: 'moderate' } });
    expect(page.body.data.add_ons.map((a: any) => a.name)).toEqual(expect.arrayContaining(['Additional server']));
    const shop = await http().get(`/api/marketplace/vendors/${vendor.vendorProfile.handle}`).expect(200);
    expect(shop.body.data.is_test).toBe(true);
  });

  it('signs in as a test vendor with the shared password', async () => {
    const login = await http().post('/api/auth/login').send({ email: 'test-venues-2@vendly.test', password });
    expect(login.status).toBeLessThan(300);
    const access = login.body.authorization.access_token;
    const me = await http().get('/api/auth/me').auth(access, { type: 'bearer' }).expect(200);
    expect(me.body.data.type).toBe('VENDOR');
  });

  it('only fills gaps when run again, keeping the password', async () => {
    const res = await asAdmin(http().post('/api/admin/test-data').send(ATLANTA)).expect(201);
    expect(res.body.data.password).toBeNull();
    expect(res.body.data.created).toMatchObject({ vendors_created: 0, packages_created: 0, add_ons_created: 0, contracts_created: 0 });
    const login = await http().post('/api/auth/login').send({ email: 'test-catering-food-1@vendly.test', password });
    expect(login.status).toBeLessThan(300);
  });

  it('resets the shared password without asking for the place again', async () => {
    const res = await asAdmin(http().post('/api/admin/test-data').send({ reset_password: true })).expect(201);
    const fresh = res.body.data.password;
    expect(fresh).toBeTruthy();
    expect(fresh).not.toBe(password);
    expect(res.body.data.near).toBe('Atlanta, GA');
    expect((await http().post('/api/auth/login').send({ email: 'test-catering-food-1@vendly.test', password })).status).toBe(401);
    expect((await http().post('/api/auth/login').send({ email: 'test-catering-food-1@vendly.test', password: fresh })).status).toBeLessThan(300);
    password = fresh;
  });

  it('removes them: an open booking is cancelled as the vendor first, and the accounts stop working', async () => {
    const vendor = await prisma.user.findFirst({ where: { email: 'test-catering-food-1@vendly.test' } });
    const listing = await prisma.vendorListing.findFirst({ where: { vendor_id: vendor.id } });
    const booking = await prisma.booking.create({ data: { customer_id: U.customer, vendor_id: vendor.id, listing_id: listing.id, status: 'PENDING', amount: 950 } });
    // leftover balances (money in, or owed) would otherwise block deleting the accounts
    const owed = await prisma.user.findFirst({ where: { is_test: true, deleted_at: null, id: { not: vendor.id } } });
    await prisma.user.update({ where: { id: vendor.id }, data: { balance: 120.5 } });
    if (owed) await prisma.user.update({ where: { id: owed.id }, data: { balance: -40 } });
    const count = await prisma.user.count({ where: { is_test: true, deleted_at: null } });

    const res = await asAdmin(http().delete('/api/admin/test-data')).expect(200);
    expect(res.body.data.wiped).toEqual(
      expect.arrayContaining([{ email: 'test-catering-food-1@vendly.test', amount: 120.5 }, ...(owed ? [{ email: owed.email, amount: -40 }] : [])]),
    );
    expect(await prisma.paymentTransaction.count({ where: { user_id: vendor.id, type: 'test_balance_wiped', amount: 120.5 } })).toBe(1);
    expect(res.body.data.cancelled).toEqual([expect.objectContaining({ booking_id: booking.id, status: 'PENDING' })]);
    expect(res.body.data.kept).toEqual([]);
    expect(res.body.data.removed).toHaveLength(count);
    const after = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(after).toMatchObject({ status: 'CANCELLED', cancelled_by: 'VENDOR', cancel_reason_code: 'other', cancel_reason: 'Test data removed' });

    expect(await prisma.user.count({ where: { is_test: true, deleted_at: null } })).toBe(0);
    const search = await http().get('/api/marketplace/listings?near_lat=33.75&near_lng=-84.39&limit=50').expect(200);
    expect(search.body.data.some((l: any) => l.is_test)).toBe(false);
    const login = await http().post('/api/auth/login').send({ email: 'test-catering-food-1@vendly.test', password });
    expect(login.status).toBe(401);
    expect((await asAdmin(http().get('/api/admin/test-data')).expect(200)).body.data.counts).toEqual({ vendors: 0, packages: 0 });
  });
});
