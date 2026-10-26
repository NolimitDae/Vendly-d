/**
 * The "Upcoming booking" tracker against a real Postgres + Redis: phone numbers and the vendor's business
 * address are only shared once a booking is accepted, the venue is geocoded in the background, and the
 * vendor's day-of steps run alongside Start and Complete. A local stub stands in for the geocoder and
 * the map tile server. Runs only when CONTRACTS_E2E_DATABASE_URL points at a migrated, disposable database:
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... npx jest --config ./test/jest-e2e.json booking-tracker --forceExit
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;
const SECRET = 'booking-tracker-e2e-secret';

if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_booking_tracker_e2e';
  process.env.APP_URL = 'http://booking-tracker.test';
  process.env.CLIENT_APP_URL = 'http://localhost:3000';
  process.env.PRIVATE_STORAGE_DIR = `/tmp/booking-tracker-e2e-${process.pid}`;
}

jest.setTimeout(240_000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// 1x1 transparent PNG
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

run('Booking tracker (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  let stub: http.Server;
  const stubHits: string[] = [];
  const id = randomBytes(4).toString('hex');
  const U = { vendor: `btv-${id}`, cust: `btc-${id}`, stranger: `bts-${id}` };
  const types: Record<string, string> = { vendor: 'VENDOR', cust: 'CUSTOMER', stranger: 'CUSTOMER' };
  const T = Object.fromEntries(
    Object.entries(U).map(([k, sub]) => [k, jwt.sign({ sub, email: `${sub}@t.test`, type: types[k] }, SECRET)]),
  ) as Record<keyof typeof U, string>;
  const L = { visit: `btl1-${id}`, studio: `btl2-${id}`, venue: `btl3-${id}` };

  const api = () => request(app.getHttpServer());
  const msg = (res: request.Response) => res.body?.message?.message ?? res.body?.message;
  const signing = () => sleep(2100); // signing endpoints are rate limited per IP
  // a drawn signature is required to sign
  const sig = (name: string, hash: string, extra: Record<string, unknown> = {}) => ({ legal_name: name, consent: true, content_sha256: hash, device_platform: 'web', signature_image: `data:image/png;base64,${PNG_B64}`, ...extra });
  const get = (bookingId: string, token: string) => api().get(`/api/bookings/${bookingId}`).auth(token, { type: 'bearer' });
  const step = (bookingId: string, path: string, token = T.vendor) => api().post(`/api/bookings/${bookingId}/${path}`).auth(token, { type: 'bearer' });
  const updateProfile = (token: string, fields: Record<string, string>) => {
    const r = api().patch('/api/auth/update').auth(token, { type: 'bearer' });
    for (const [k, v] of Object.entries(fields)) r.field(k, v);
    return r;
  };

  beforeAll(async () => {
    // stands in for Nominatim (geocoding) and the OpenStreetMap tile server
    stub = http.createServer((req, res) => {
      stubHits.push(`${req.url} ${req.headers['user-agent']}`);
      if (req.url?.startsWith('/search')) {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify([{ lat: '30.2672', lon: '-97.7431' }]));
      }
      if (req.url?.startsWith('/tiles/')) {
        res.setHeader('Content-Type', 'image/png');
        return res.end(Buffer.from(PNG_B64, 'base64'));
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((r) => stub.listen(0, '127.0.0.1', () => r()));
    const base = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
    process.env.GEOCODER_URL = base;
    process.env.MAP_TILE_URL = `${base}/tiles/{z}/{x}/{y}.png`;

    const { AppModule } = await import('../src/app.module');
    const { PrismaService } = await import('../src/prisma/prisma.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.user.createMany({
      data: Object.entries(U).map(([k, uid]) => ({ id: uid, email: `${uid}@t.test`, name: `${k} user`, type: types[k], email_verified_at: new Date() })),
    });
    await prisma.vendorProfile.create({ data: { user_id: U.vendor, license_photo: [], business_name: 'Sam Sounds LLC' } });
    await prisma.vendorListing.createMany({
      data: [
        { id: L.visit, vendor_id: U.vendor, title: 'Party DJ', description: '4 hours', price: 400, status: 'ACTIVE', location: 'Austin, TX' },
        { id: L.studio, vendor_id: U.vendor, title: 'Studio recording', description: '2 hours', price: 200, status: 'ACTIVE', location: 'Austin, TX', service_at: 'VENDOR_LOCATION' },
      ],
    });
    // a venue package (the seeded Venues category), booked without a service address
    const venues = await prisma.serviceCategory.upsert({ where: { name: 'Venues' }, update: {}, create: { name: 'Venues' } });
    await prisma.vendorListing.create({
      data: { id: L.venue, vendor_id: U.vendor, title: 'Garden hall', description: 'Evening hire', price: 1500, status: 'ACTIVE', location: 'Austin, TX', category_id: venues.id },
    });
    const vc = await api().post('/api/vendor/contracts/default').auth(T.vendor, { type: 'bearer' }).send({
      category: 'PHOTO_VIDEO',
      field_values: {
        business_legal_name: 'Sam Sounds LLC', business_address: '1 Beat St', cancellation_policy: 'moderate',
        governing_law: 'Texas, USA', delivery_time_days: '30', revisions_included: '2', usage_rights: 'personal',
      },
    });
    expect(vc.status).toBe(201);
  });

  afterAll(async () => {
    await app?.close();
    await new Promise((r) => stub?.close(r));
  });

  it('both sides add a phone number in Edit profile (checked loosely); the vendor adds a private business address', async () => {
    const bad = await updateProfile(T.cust, { phone_number: 'call me maybe' });
    expect(bad.body).toMatchObject({ success: false });
    expect((await updateProfile(T.cust, { phone_number: '+1 (512) 555-0101' })).body.success).toBe(true);
    expect((await updateProfile(T.vendor, { phone_number: '512 555 0202', business_address: '1 Beat St, Austin, TX' })).body.success).toBe(true);

    const me = await api().get('/api/auth/me').auth(T.vendor, { type: 'bearer' });
    expect(me.body.data).toMatchObject({ phone_number: '512 555 0202', business_address: '1 Beat St, Austin, TX' });
    // the business address is put on the map in the background
    for (let i = 0; i < 20; i++) {
      const p = await prisma.vendorProfile.findUnique({ where: { user_id: U.vendor } });
      if (p.business_lat != null) break;
      await sleep(100);
    }
    expect(await prisma.vendorProfile.findUnique({ where: { user_id: U.vendor }, select: { business_lat: true, business_lng: true } })).toEqual({ business_lat: 30.2672, business_lng: -97.7431 });
  });

  let bookingId: string;
  let contractHash: string;

  it('a request is geocoded in the background and shows no phone numbers to either side', async () => {
    const start = new Date(Date.now() + 3 * 3600e3);
    const body = {
      listing_id: L.visit, vendor_id: U.vendor, timezone: 'America/Chicago',
      event_start_at: start, event_end_at: new Date(start.getTime() + 4 * 3600e3), venue_address: '500 Congress Ave, Austin, TX', guest_count: 50,
    };
    const pv = await api().post('/api/contracts/booking-preview').auth(T.cust, { type: 'bearer' }).send(body);
    expect(pv.status).toBe(201);
    contractHash = pv.body.data.content_sha256;
    await signing();
    const res = await api().post('/api/bookings').auth(T.cust, { type: 'bearer' })
      .send({ ...body, preview_token: pv.body.data.preview_token, signature: sig('Cara Customer', contractHash) });
    expect(res.status).toBe(201);
    bookingId = res.body.data.id;

    for (let i = 0; i < 20; i++) {
      const b = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (b.venue_geocoded_at) break;
      await sleep(100);
    }
    const stored = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(stored).toMatchObject({ venue_lat: 30.2672, venue_lng: -97.7431 });
    expect(stubHits.some((h) => h.includes('/search') && h.includes('Vendly/1.0'))).toBe(true);

    for (const token of [T.cust, T.vendor]) {
      const b = (await get(bookingId, token)).body.data;
      expect(b).toMatchObject({ status: 'PENDING', contact_revealed: false, contact_phone: null, vendor_place: null, service_at: 'CUSTOMER_LOCATION' });
      expect(JSON.stringify(b)).not.toContain('555');
    }
    // nor can the vendor mark steps on a request
    const early = await step(bookingId, 'en-route');
    expect(early.status).toBe(400);
  });

  it('once accepted, each side sees the other’s number on the booking (never in lists)', async () => {
    await signing();
    const confirmed = await api().patch(`/api/bookings/${bookingId}/confirm`).auth(T.vendor, { type: 'bearer' })
      .send({ signature: sig('Sam Vendor', contractHash, { signature_image: `data:image/png;base64,${PNG_B64}` }) });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe('CONFIRMED');

    const forCustomer = (await get(bookingId, T.cust)).body.data;
    expect(forCustomer).toMatchObject({ contact_revealed: true, contact_phone: '512 555 0202', confirmed_at: expect.any(String) });
    const forVendor = (await get(bookingId, T.vendor)).body.data;
    expect(forVendor).toMatchObject({ contact_revealed: true, contact_phone: '+1 (512) 555-0101', steps_open: true });

    const lists = await Promise.all([
      api().get('/api/bookings/my/customer').auth(T.cust, { type: 'bearer' }),
      api().get('/api/bookings/my/vendor').auth(T.vendor, { type: 'bearer' }),
    ]);
    for (const l of lists) expect(JSON.stringify(l.body)).not.toContain('555');
    expect((await get(bookingId, T.stranger)).status).toBe(403);
  });

  it('on the day: on my way → arrived → start → complete, with the steps only moving forward', async () => {
    expect((await step(bookingId, 'en-route', T.cust)).status).toBe(403);
    expect((await step(bookingId, 'check-in')).status).toBe(400); // the vendor goes to the customer here

    const onWay = await step(bookingId, 'en-route');
    expect(onWay.status).toBe(201);
    expect(onWay.body.data).toMatchObject({ status: 'CONFIRMED', en_route_at: expect.any(String) });
    const firstAt = onWay.body.data.en_route_at;
    await sleep(1100);
    const again = await step(bookingId, 'en-route');
    expect(again.body.data.en_route_at).toBe(firstAt);

    await sleep(1100);
    const arrived = await step(bookingId, 'arrived');
    expect(arrived.body.data).toMatchObject({ status: 'CONFIRMED', arrived_at: expect.any(String) });

    // the customer was told both times (inbox; the push follows their settings)
    const inbox = await prisma.notification.findMany({ where: { receiver_id: U.cust, entity_id: bookingId }, include: { notification_event: true } });
    const texts = inbox.map((n: any) => n.notification_event.text);
    expect(texts.some((t: string) => t.startsWith('On the way:'))).toBe(true);
    expect(texts.some((t: string) => t.startsWith('Your vendor has arrived:'))).toBe(true);

    const started = await api().patch(`/api/bookings/${bookingId}/start`).auth(T.vendor, { type: 'bearer' });
    expect(started.status).toBe(200);
    expect(started.body.data).toMatchObject({ status: 'IN_PROGRESS', started_at: expect.any(String) });
    expect((await step(bookingId, 'arrived')).status).toBe(201); // already done: nothing changes
    expect((await get(bookingId, T.cust)).body.data.contact_phone).toBe('512 555 0202');

    // the event has begun
    await prisma.booking.update({ where: { id: bookingId }, data: { event_start_at: new Date(Date.now() - 3600e3) } });
    const done = await api().patch(`/api/bookings/${bookingId}/complete`).auth(T.vendor, { type: 'bearer' });
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('COMPLETED');
    expect((await get(bookingId, T.cust)).body.data.contact_phone).toBe('512 555 0202');

    // a few days after it's done the numbers are gone again
    await prisma.booking.update({ where: { id: bookingId }, data: { completed_at: new Date(Date.now() - 4 * 86400e3) } });
    expect((await get(bookingId, T.cust)).body.data).toMatchObject({ contact_revealed: false, contact_phone: null });
    expect((await get(bookingId, T.vendor)).body.data.contact_phone).toBeNull();
  });

  it('the vendor’s business address is shown only once a booking at their place is accepted', async () => {
    const start = new Date(Date.now() + 5 * 3600e3);
    const b = await prisma.booking.create({
      data: { customer_id: U.cust, vendor_id: U.vendor, listing_id: L.studio, status: 'PENDING', amount: 200, service_fee: 10, event_start_at: start, scheduled_at: start },
    });
    const pending = (await get(b.id, T.cust)).body.data;
    expect(pending).toMatchObject({ service_at: 'VENDOR_LOCATION', vendor_place: null, contact_phone: null });
    expect(pending.listing.location).toBe('Austin, TX');
    expect(JSON.stringify(pending)).not.toContain('Beat St');

    await prisma.booking.update({ where: { id: b.id }, data: { status: 'CONFIRMED' } });
    const accepted = (await get(b.id, T.cust)).body.data;
    expect(accepted.vendor_place).toEqual({ address: '1 Beat St, Austin, TX', lat: 30.2672, lng: -97.7431 });
    // the vendor doesn't get their own address back, and the customer arriving is the vendor's step
    expect((await get(b.id, T.vendor)).body.data.vendor_place).toBeNull();
    expect((await step(b.id, 'en-route')).status).toBe(400);
    const checkIn = await step(b.id, 'check-in');
    expect(checkIn.status).toBe(201);
    expect(checkIn.body.data.checked_in_at).toEqual(expect.any(String));

    await prisma.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED', cancelled_at: new Date() } });
    expect((await get(b.id, T.cust)).body.data).toMatchObject({ vendor_place: null, contact_phone: null });
  });

  it('a venue is booked without a service address but with a guest count, and its address stays private until accepted', async () => {
    // the venue's own (private) address, distinct from anything else in this run
    await prisma.vendorProfile.update({ where: { user_id: U.vendor }, data: { business_address: '77 Hall Rd, Austin, TX', business_lat: 30.25, business_lng: -97.75, business_geocoded_at: new Date() } });
    const listing = (await api().get(`/api/marketplace/listings/${L.venue}`)).body.data;
    expect(listing).toMatchObject({ needs_service_address: false, needs_guest_count: true });
    expect((await api().get(`/api/marketplace/listings/${L.visit}`)).body.data).toMatchObject({ needs_service_address: true, needs_guest_count: false });

    const start = new Date(Date.now() + 6 * 3600e3);
    const body = { listing_id: L.venue, vendor_id: U.vendor, timezone: 'America/Chicago', event_start_at: start, event_end_at: new Date(start.getTime() + 4 * 3600e3) };
    const preview = (extra: Record<string, unknown>) => api().post('/api/contracts/booking-preview').auth(T.cust, { type: 'bearer' }).send({ ...body, ...extra });

    // no guests: refused with a clear message
    const noGuests = await preview({});
    expect(noGuests.status).toBe(400);
    expect(msg(noGuests)).toBe('Enter how many guests are coming. The venue needs a guest count to take the booking.');

    // guests and no address: the contract's venue (required by this vendor's contract) is the venue's town only
    const pv = await preview({ guest_count: 80 });
    expect(pv.status).toBe(201);
    expect(pv.body.data).toMatchObject({ missing_fields: [], missing_message: null });
    expect(pv.body.data.body).toContain("- Venue: At the Vendor's place in Austin, TX. The full address is shared through Vendly once the booking is accepted.");
    expect(pv.body.data.body).toContain('- Guest count: 80');
    expect(JSON.stringify(pv.body)).not.toContain('Hall Rd');

    // the signed request is checked the same way
    await signing();
    const token = pv.body.data.preview_token;
    const hash = pv.body.data.content_sha256;
    const refused = await api().post('/api/bookings').auth(T.cust, { type: 'bearer' }).send({ ...body, preview_token: token, signature: sig('Cara Customer', hash) });
    expect(refused.status).toBe(400);
    expect(msg(refused)).toBe('Enter how many guests are coming. The venue needs a guest count to take the booking.');

    // an address sent anyway (an older app) isn't used: the contract stays the one reviewed
    await signing();
    const sent = await api().post('/api/bookings').auth(T.cust, { type: 'bearer' })
      .send({ ...body, guest_count: 80, venue_address: '9 Other Pl, Austin, TX', preview_token: token, signature: sig('Cara Customer', hash) });
    expect(sent.status).toBe(201);
    const venueBooking = sent.body.data.id;
    expect(await prisma.booking.findUnique({ where: { id: venueBooking }, select: { venue_address: true, guest_count: true } })).toEqual({ venue_address: 'Austin, TX', guest_count: 80 });

    const pending = (await get(venueBooking, T.cust)).body.data;
    expect(pending).toMatchObject({ status: 'PENDING', service_at: 'VENDOR_LOCATION', vendor_place: null });
    expect(JSON.stringify(pending)).not.toContain('Hall Rd');
    const list = await api().get('/api/bookings/my/customer').auth(T.cust, { type: 'bearer' });
    expect(JSON.stringify(list.body)).not.toContain('Hall Rd');

    await signing();
    const confirmed = await api().patch(`/api/bookings/${venueBooking}/confirm`).auth(T.vendor, { type: 'bearer' })
      .send({ signature: sig('Sam Vendor', hash, { signature_image: `data:image/png;base64,${PNG_B64}` }) });
    expect(confirmed.status).toBe(200);
    // accepted: the customer sees where to go, and the customer arriving is the venue's day-of step
    expect((await get(venueBooking, T.cust)).body.data.vendor_place).toEqual({ address: '77 Hall Rd, Austin, TX', lat: 30.25, lng: -97.75 });
    expect((await step(venueBooking, 'en-route')).status).toBe(400);
  });

  it('serves map tiles to signed-in users through the cache, and only the booking map zooms', async () => {
    const tile = (path: string) => api().get(`/api/geo/tile/${path}`).auth(T.cust, { type: 'bearer' });
    // a tile this run hasn't cached before
    const x = parseInt(id, 16) % 32768;
    const before = stubHits.filter((h) => h.includes('/tiles/')).length;
    expect((await api().get(`/api/geo/tile/15/${x}/13529`)).status).toBe(401);
    const first = await tile(`15/${x}/13529`);
    expect(first.status).toBe(200);
    expect(first.headers['content-type']).toBe('image/png');
    expect(first.headers['cache-control']).toMatch(/^private, max-age=/);
    await tile(`15/${x}/13529.png`).expect(200);
    expect(stubHits.filter((h) => h.includes('/tiles/')).length).toBe(before + 1);
    expect((await tile('2/1/0')).status).toBe(404);
    expect((await tile('19/0/0')).status).toBe(404);
    expect((await tile('25/0/0')).status).toBe(404);
    expect(msg(await tile('15/a/0'))).toBe('No such map tile.');
  });
});
