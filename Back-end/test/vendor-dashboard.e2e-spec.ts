/**
 * The vendor dashboard home against a real Postgres + Redis: what needs the vendor's attention (requests
 * with when they close, the customer's answer to suggested changes, a missed deposit, a failed charge, an
 * open complaint, a rental to check back in, a fee the customer hasn't answered, unread chats) and the
 * next bookings. Vendors only, and only their own bookings.
 * Runs only when CONTRACTS_E2E_DATABASE_URL points at a migrated, disposable database:
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... npx jest --config ./test/jest-e2e.json vendor-dashboard --forceExit
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;
const SECRET = 'vendor-dashboard-e2e-secret';

if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_vendor_dashboard_e2e';
  process.env.APP_URL = 'http://vendor-dashboard.test';
  process.env.CLIENT_APP_URL = 'http://localhost:3000';
  process.env.PRIVATE_STORAGE_DIR = `/tmp/vendor-dashboard-e2e-${process.pid}`;
}

jest.setTimeout(240_000);

const HOUR = 3600e3;
const DAY = 24 * HOUR;

run('Vendor dashboard home (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  const id = randomBytes(4).toString('hex');
  const U = { vendor: `vdv-${id}`, other: `vdo-${id}`, cust: `vdc-${id}` };
  const types: Record<string, string> = { vendor: 'VENDOR', other: 'VENDOR', cust: 'CUSTOMER' };
  const T = Object.fromEntries(Object.entries(U).map(([k, sub]) => [k, jwt.sign({ sub, email: `${sub}@t.test`, type: types[k] }, SECRET)])) as Record<keyof typeof U, string>;
  const B = {
    request: `vdb1-${id}`,
    approved: `vdb2-${id}`,
    withCustomer: `vdb3-${id}`,
    deposit: `vdb4-${id}`,
    failed: `vdb5-${id}`,
    complaint: `vdb6-${id}`,
    rental: `vdb7-${id}`,
    fee: `vdb8-${id}`,
    later: `vdb9-${id}`,
    stranger: `vdb10-${id}`,
  };
  const L = `vdl-${id}`;
  const now = Date.now();
  const home = (token: string) => request(app.getHttpServer()).get('/api/vendor/dashboard').auth(token, { type: 'bearer' });

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module');
    const { PrismaService } = await import('../src/prisma/prisma.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.user.createMany({
      data: Object.entries(U).map(([k, uid]) => ({ id: uid, email: `${uid}@t.test`, name: k === 'cust' ? 'Ana Lee' : `${k} vendor`, type: types[k], email_verified_at: new Date() })),
    });
    await prisma.vendorListing.create({ data: { id: L, vendor_id: U.vendor, title: 'Party DJ', description: '4 hours', price: 400, status: 'ACTIVE', location: 'Austin, TX' } });
    const vc = await prisma.vendorContract.create({ data: { vendor_id: U.vendor, type: 'UPLOADED', version: 1 } });

    const booking = (bid: string, over: Record<string, unknown> = {}) => ({
      id: bid,
      vendor_id: U.vendor,
      customer_id: U.cust,
      listing_id: L,
      amount: 400,
      status: 'CONFIRMED',
      event_start_at: new Date(now + 20 * DAY),
      ...over,
    });
    await prisma.booking.createMany({
      data: [
        booking(B.request, { status: 'PENDING', created_at: new Date(now - 10 * HOUR) }),
        booking(B.approved, { status: 'PENDING' }),
        booking(B.withCustomer, { status: 'PENDING' }),
        booking(B.deposit, { payment_due_by: new Date(now + 6 * HOUR), payment_due_kind: 'deposit', event_start_at: new Date(now + 2 * DAY) }),
        booking(B.failed, { status: 'COMPLETED', event_start_at: new Date(now - 5 * DAY) }),
        booking(B.complaint, { status: 'COMPLETED', event_start_at: new Date(now - 8 * DAY), dispute_opened_at: new Date(now - DAY), dispute_category: 'no_show' }),
        booking(B.rental, { listing_id: null, event_start_at: new Date(now - 3 * DAY) }),
        booking(B.fee, { status: 'IN_PROGRESS', event_start_at: new Date(now - HOUR) }),
        booking(B.later, { event_start_at: new Date(now + 9 * DAY) }),
        // someone else's request: never on this vendor's dashboard
        { ...booking(B.stranger, { status: 'PENDING' }), vendor_id: U.other },
      ],
    });
    const contract = (bid: string, version: number, status: string, over: Record<string, unknown> = {}) => ({
      booking_id: bid,
      vendor_contract_id: vc.id,
      version,
      status,
      title: 'Agreement',
      rendered_body: 'Terms',
      merge_data: {},
      content_sha256: 'a'.repeat(64),
      verification_code: randomBytes(8).toString('hex'),
      ...over,
    });
    const v1a = await prisma.bookingContract.create({ data: contract(B.approved, 1, 'SUPERSEDED') });
    await prisma.bookingContract.create({ data: contract(B.approved, 2, 'AWAITING_VENDOR', { supersedes_id: v1a.id, merge_data: { request_changes: { after: { total: 450 } } } }) });
    const v1c = await prisma.bookingContract.create({ data: contract(B.withCustomer, 1, 'AWAITING_VENDOR') });
    await prisma.bookingContract.create({ data: contract(B.withCustomer, 2, 'AWAITING_CUSTOMER', { supersedes_id: v1c.id, merge_data: { request_changes: { after: { total: 450 } } } }) });

    await prisma.bookingInstallment.create({
      data: { booking_id: B.failed, sequence: 2, label: 'Late fee', amount: 40, due_at: new Date(now - DAY), status: 'FAILED', kind: 'extra', attempts: 3, last_error: 'Card declined' },
    });
    const item = await prisma.rentalItem.create({ data: { vendor_id: U.vendor, title: 'Gold chairs', description: 'Set of 10', daily_rate: 50, quantity: 20, status: 'ACTIVE' } });
    await prisma.rentalReservation.create({
      data: { item_id: item.id, booking_id: B.rental, start_date: new Date(now - 3 * DAY), end_date: new Date(now - DAY), quantity: 10, daily_rate: 50 },
    });
    await prisma.bookingExtra.create({ data: { booking_id: B.fee, kind: 'FEE', name: 'Travel fee', unit_price: 30, amount: 30, status: 'PENDING' } });

    // two chats: one with two unread messages, one read
    const chat = await prisma.conversation.create({ data: { participants: { create: [{ userId: U.vendor, lastReadAt: new Date(now - DAY) }, { userId: U.cust }] } } });
    await prisma.message.createMany({
      data: [
        { conversationId: chat.id, senderId: U.cust, text: 'Hi', createdAt: new Date(now - 2 * DAY) },
        { conversationId: chat.id, senderId: U.cust, text: 'Are you free?', createdAt: new Date(now - HOUR) },
        { conversationId: chat.id, senderId: U.cust, text: 'Hello?', createdAt: new Date(now - 30 * 60e3) },
        { conversationId: chat.id, senderId: U.vendor, text: 'Yes', createdAt: new Date(now - 10 * 60e3) },
      ],
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('is for vendors only', async () => {
    const res = await home(T.cust);
    expect(res.status).toBe(403);
    expect((await request(app.getHttpServer()).get('/api/vendor/dashboard')).status).toBe(401);
  });

  it('lists what needs the vendor, most urgent first', async () => {
    const res = await home(T.vendor);
    expect(res.status).toBe(200);
    const items = res.body.data.attention as any[];
    const of = (bid: string | null) => items.filter((i) => i.booking_id === bid);

    expect(items.map((i) => i.kind)).toEqual(['request', 'changes_approved', 'payment', 'payment', 'dispute', 'rental_return', 'extra_waiting', 'unread_chats']);
    // 72 hours after it was made
    expect(of(B.request)[0]).toMatchObject({ kind: 'request', title: 'Party DJ', customer_name: 'Ana Lee' });
    expect(new Date(of(B.request)[0].at).getTime()).toBeCloseTo(now + 62 * HOUR, -4);
    // changes with the customer aren't the vendor's to answer
    expect(of(B.withCustomer)).toEqual([]);
    expect(of(B.deposit)[0]).toMatchObject({ kind: 'payment', detail: 'deposit' });
    expect(of(B.failed)[0]).toMatchObject({ kind: 'payment', detail: 'Late fee', amount: 40, done: false });
    expect(of(B.complaint)[0]).toMatchObject({ kind: 'dispute', detail: 'no_show', done: false });
    expect(of(B.rental)[0]).toMatchObject({ kind: 'rental_return', title: 'Gold chairs' });
    expect(of(B.fee)[0]).toMatchObject({ kind: 'extra_waiting', detail: 'Travel fee', amount: 30 });
    expect(of(null)[0]).toMatchObject({ kind: 'unread_chats', chats: 1, messages: 2 });
    expect(of(B.stranger)).toEqual([]);
  });

  it('things drop off once handled', async () => {
    await prisma.rentalReturn.create({ data: { booking_id: B.rental, recorded_by: U.vendor } });
    await prisma.booking.update({ where: { id: B.complaint }, data: { dispute_resolved_at: new Date() } });
    await prisma.participant.updateMany({ where: { userId: U.vendor }, data: { lastReadAt: new Date() } });
    const kinds = (await home(T.vendor)).body.data.attention.map((i: any) => i.kind);
    expect(kinds).not.toContain('rental_return');
    expect(kinds).not.toContain('dispute');
    expect(kinds).not.toContain('unread_chats');
  });

  it('lists upcoming bookings soonest first, the one under way on top, with the day-of fields', async () => {
    const upcoming = (await home(T.vendor)).body.data.upcoming as any[];
    expect(upcoming.map((b) => b.id)).toEqual([B.fee, B.deposit, B.later]);
    expect(upcoming[0]).toMatchObject({ status: 'IN_PROGRESS', title: 'Party DJ', customer: { name: 'Ana Lee' }, service_at: 'CUSTOMER_LOCATION', steps_open: true, is_rental: false });
    expect(upcoming[1]).toMatchObject({ steps_open: false, payment_state: 'pending_deposit', amount: 400 });
    // the rental started 3 days ago and isn't listed
    expect(upcoming.find((b) => b.id === B.rental)).toBeUndefined();
  });

  it("another vendor sees only their own", async () => {
    const res = await home(T.other);
    expect(res.body.data.attention.map((i: any) => i.booking_id)).toEqual([B.stranger]);
    expect(res.body.data.upcoming).toEqual([]);
  });
});
