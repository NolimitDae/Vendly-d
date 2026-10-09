/**
 * Full contract flow against a real Postgres + Redis.
 * Runs only when CONTRACTS_E2E_DATABASE_URL points at a migrated, disposable database:
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... yarn test:e2e:contracts
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as request from 'supertest';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;
const SECRET = 'contracts-e2e-secret';

if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_contracts_e2e';
  process.env.APP_URL = 'http://contracts.test';
  process.env.CLIENT_APP_URL = 'http://localhost:3000';
  process.env.PRIVATE_STORAGE_DIR = `/tmp/contracts-e2e-${process.pid}`;
}

jest.setTimeout(240_000);

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// 1x1 transparent PNG
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

run('Contracts (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  const id = randomBytes(4).toString('hex');
  const U = {
    vendor: `v1-${id}`,
    vendor2: `v2-${id}`,
    cust: `c1-${id}`,
    planner: `p1-${id}`,
    stranger: `s1-${id}`,
    stranger2: `s2-${id}`,
    admin: `a1-${id}`,
  };
  const types: Record<string, string> = {
    vendor: 'VENDOR', vendor2: 'VENDOR', cust: 'CUSTOMER', planner: 'EVENT_PLANNER',
    stranger: 'CUSTOMER', stranger2: 'CUSTOMER', admin: 'ADMIN',
  };
  const T = Object.fromEntries(
    Object.entries(U).map(([k, sub]) => [k, jwt.sign({ sub, email: `${sub}@t.test`, type: types[k] }, SECRET)]),
  ) as Record<keyof typeof U, string>;
  const L = { photo: `l1-${id}`, tent: `l2-${id}` };
  const EVENT = `e1-${id}`;

  const start = new Date(Date.now() + 40 * 86400e3);
  start.setUTCHours(22, 0, 0, 0);
  const end = new Date(start.getTime() + 6 * 3600e3);
  const full = {
    listing_id: L.photo, vendor_id: U.vendor, timezone: 'America/Chicago', message: 'First dance please',
    event_start_at: start, event_end_at: end, venue_address: 'Grand Hall, Austin TX', guest_count: 120,
  };
  const photoFields = {
    business_legal_name: 'Vera Photo LLC', business_address: '1 Lens Way', cancellation_policy: 'moderate',
    governing_law: 'Texas, USA', delivery_time_days: '30', revisions_included: '2', usage_rights: 'personal',
  };
  const sig = (name: string, hash: string, extra: Record<string, unknown> = {}) => ({
    legal_name: name, consent: true, content_sha256: hash, device_platform: 'web', ...extra,
  });

  const http = () => request(app.getHttpServer());
  const msg = (res: request.Response) => res.body?.message?.message ?? res.body?.message;
  // signing endpoints are rate limited per IP
  const signing = async () => sleep(2100);
  const fetchLink = (url: string) =>
    http().get(new URL(url).pathname).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

  async function signedBooking(token: string, body: any, name: string) {
    const pv = await http().post('/api/contracts/booking-preview').auth(token, { type: 'bearer' }).send(body);
    await signing();
    const b = await http().post('/api/bookings').auth(token, { type: 'bearer' })
      .send({ ...body, preview_token: pv.body.data.preview_token, signature: sig(name, pv.body.data.content_sha256) });
    return { preview: pv.body.data, booking: b.body.data };
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
    await prisma.vendorProfile.createMany({
      data: [
        { user_id: U.vendor, business_name: 'Vera Photo LLC', address: '1 Lens Way' },
        { user_id: U.vendor2, business_name: 'Upload Co', address: '2 Paper St' },
      ],
    });
    await prisma.vendorListing.createMany({
      data: [
        { id: L.photo, vendor_id: U.vendor, title: 'Wedding Photography', description: '8 hours', price: 1500, status: 'ACTIVE' },
        { id: L.tent, vendor_id: U.vendor2, title: 'Tent Rental', description: 'Large tent', price: 800, status: 'ACTIVE' },
      ],
    });
    await prisma.event.create({ data: { id: EVENT, event_planner_id: U.planner, name: 'Smith Wedding', venue: 'Grand Hall', guest_count: 150 } });
  });

  afterAll(async () => {
    await app?.close();
  });

  let bookingId: string;
  let contractId: string;
  let executedHash: string;
  let pdf: Buffer;
  let vc1: string;

  it('vendor sets up the default contract', async () => {
    const missing = await http().post('/api/vendor/contracts/default').auth(T.vendor, { type: 'bearer' })
      .send({ category: 'PHOTO_VIDEO', field_values: { business_legal_name: 'x' } });
    expect(missing.status).toBe(400);
    expect(msg(missing)).toMatch(/fill in/i);

    const res = await http().post('/api/vendor/contracts/default').auth(T.vendor, { type: 'bearer' })
      .send({ category: 'PHOTO_VIDEO', field_values: photoFields, additional_terms: 'No flash.' });
    expect(res.status).toBe(201);
    vc1 = res.body.data.id;
  });

  it('a missing required field blocks sending', async () => {
    const pv = await http().post('/api/contracts/booking-preview').auth(T.cust, { type: 'bearer' })
      .send({ listing_id: L.photo, vendor_id: U.vendor, scheduled_at: start });
    expect(pv.body.data.missing_fields).toEqual(expect.arrayContaining(['venue_address', 'event_start_time']));
    await signing();
    const res = await http().post('/api/bookings').auth(T.cust, { type: 'bearer' }).send({
      listing_id: L.photo, vendor_id: U.vendor, scheduled_at: start,
      preview_token: pv.body.data.preview_token, signature: sig('Carl Customer', pv.body.data.content_sha256),
    });
    expect(res.status).toBe(400);
    expect(msg(res)).toMatch(/Missing: .*venue address/);
  });

  it('customer signs at request, vendor accepts and signs, contract executes with a stored PDF hash', async () => {
    const pv = await http().post('/api/contracts/booking-preview').auth(T.cust, { type: 'bearer' }).send(full);
    expect(pv.body.data.missing_fields).toEqual([]);
    await signing();
    const created = await http().post('/api/bookings').auth(T.cust, { type: 'bearer' }).send({
      ...full, preview_token: pv.body.data.preview_token,
      signature: sig('Carl Customer', pv.body.data.content_sha256, { signature_image: PNG }),
    });
    expect(created.status).toBe(201);
    bookingId = created.body.data.id;

    const list = await http().get(`/api/contracts/booking/${bookingId}`).auth(T.cust, { type: 'bearer' });
    contractId = list.body.data.contracts[0].id;
    expect(list.body.data.contracts[0].status).toBe('AWAITING_VENDOR');

    await signing();
    const noSig = await http().patch(`/api/bookings/${bookingId}/confirm`).auth(T.vendor, { type: 'bearer' }).send({});
    expect(noSig.status).toBe(400);

    await signing();
    const confirmed = await http().patch(`/api/bookings/${bookingId}/confirm`).auth(T.vendor, { type: 'bearer' })
      .send({ signature: sig('Vera Vendor', pv.body.data.content_sha256, { signature_image: PNG, save_signature: true }) });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe('CONFIRMED');

    const c = await http().get(`/api/contracts/${contractId}`).auth(T.cust, { type: 'bearer' });
    expect(c.body.data.status).toBe('EXECUTED');
    expect(c.body.data.signatures).toHaveLength(2);
    executedHash = c.body.data.executed_pdf_sha256;

    const link = await http().get(`/api/contracts/${contractId}/download`).auth(T.cust, { type: 'bearer' });
    pdf = (await fetchLink(link.body.data.url)).body;
    expect(sha(pdf)).toBe(executedHash);
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThanOrEqual(3);
  });

  it('the hash check detects a modified PDF', async () => {
    const genuine = await http().post('/api/contracts/verify').attach('file', pdf, 'c.pdf');
    expect(genuine.body.data).toMatchObject({ valid: true, booking_id: bookingId });

    const tampered = Buffer.from(pdf);
    tampered[tampered.length - 20] ^= 1;
    const bad = await http().post('/api/contracts/verify').attach('file', tampered, 'c.pdf');
    expect(bad.body.data.valid).toBe(false);
  });

  it('denies a non-party on every contract endpoint', async () => {
    const calls: Array<[string, () => request.Test]> = [
      ['list', () => http().get(`/api/contracts/booking/${bookingId}`)],
      ['view', () => http().get(`/api/contracts/${contractId}`)],
      ['download', () => http().get(`/api/contracts/${contractId}/download`)],
      ['sign', () => http().post(`/api/contracts/${contractId}/sign`).send({ signature: sig('Sam Stranger', 'a'.repeat(64)) })],
      ['decline', () => http().post(`/api/contracts/${contractId}/decline`)],
      ['amend preview', () => http().post(`/api/contracts/booking/${bookingId}/amendments/preview`).send({ changes: { guest_count: 5 } })],
      ['event', () => http().get(`/api/contracts/event/${EVENT}`)],
      ['event zip', () => http().get(`/api/contracts/event/${EVENT}/zip`)],
      ['admin', () => http().get(`/api/admin/contracts/bookings/${bookingId}`)],
    ];
    for (const [label, call] of calls) {
      await signing();
      const res = await call().auth(T.stranger, { type: 'bearer' });
      expect({ label, status: res.status }).toEqual({ label, status: 403 });
    }
  });

  it('a vendor template edit does not change signed contracts', async () => {
    const edit = await http().put(`/api/vendor/contracts/${vc1}/default`).auth(T.vendor, { type: 'bearer' })
      .send({ category: 'PHOTO_VIDEO', field_values: { ...photoFields, cancellation_policy: 'strict' } });
    expect(edit.body.data.version).toBe(2);
    const c = await http().get(`/api/contracts/${contractId}`).auth(T.cust, { type: 'bearer' });
    expect(c.body.data.body).toContain('Moderate');
    expect(c.body.data.body).not.toContain('Strict');
  });

  it('an amendment supersedes the old version and requires both signatures', async () => {
    const newStart = new Date(start.getTime() + 7 * 86400e3);
    const changes = { event_start_at: newStart, event_end_at: new Date(newStart.getTime() + 6 * 3600e3) };
    const pv = await http().post(`/api/contracts/booking/${bookingId}/amendments/preview`).auth(T.cust, { type: 'bearer' }).send({ changes });
    await signing();
    const req = await http().post(`/api/contracts/booking/${bookingId}/amendments`).auth(T.cust, { type: 'bearer' })
      .send({ changes, signature: sig('Carl Customer', pv.body.data.content_sha256) });
    expect(req.body.data.status).toBe('AWAITING_VENDOR');

    let booking = await http().get(`/api/bookings/${bookingId}`).auth(T.cust, { type: 'bearer' });
    expect(new Date(booking.body.data.event_start_at).getTime()).toBe(start.getTime());

    await signing();
    const self = await http().post(`/api/contracts/${req.body.data.id}/sign`).auth(T.cust, { type: 'bearer' })
      .send({ signature: sig('Carl Customer', pv.body.data.content_sha256) });
    expect(self.status).toBe(403);

    await signing();
    const signed = await http().post(`/api/contracts/${req.body.data.id}/sign`).auth(T.vendor, { type: 'bearer' })
      .send({ signature: sig('Vera Vendor', pv.body.data.content_sha256, { use_saved_signature: true }) });
    expect(signed.body.data.status).toBe('EXECUTED');

    const list = await http().get(`/api/contracts/booking/${bookingId}`).auth(T.cust, { type: 'bearer' });
    const byVersion = Object.fromEntries(list.body.data.contracts.map((c: any) => [c.version, c.status]));
    expect(byVersion).toEqual({ 1: 'SUPERSEDED', 2: 'EXECUTED' });
    booking = await http().get(`/api/bookings/${bookingId}`).auth(T.cust, { type: 'bearer' });
    expect(new Date(booking.body.data.event_start_at).getTime()).toBe(newStart.getTime());
  });

  it('decline voids the contract with no charge', async () => {
    const { booking } = await signedBooking(T.cust, full, 'Carl Customer');
    await signing();
    await http().patch(`/api/bookings/${booking.id}/reject`).auth(T.vendor, { type: 'bearer' }).send({ reason: 'Unavailable' });
    const list = await http().get(`/api/contracts/booking/${booking.id}`).auth(T.cust, { type: 'bearer' });
    expect(list.body.data.contracts[0].status).toBe('VOID');
    const txns = await prisma.paymentTransaction.count({ where: { user_id: U.cust } });
    expect(txns).toBe(0);
  });

  it('validates uploaded PDFs and builds vendor PDF + addendum + certificate', async () => {
    const doc = await PDFDocument.create();
    doc.addPage().drawText('Own terms', { font: await doc.embedFont(StandardFonts.Helvetica) });
    const vpdf = Buffer.from(await doc.save());
    const upload = (buf: Buffer) =>
      http().post('/api/vendor/contracts/upload').auth(T.vendor2, { type: 'bearer' })
        .attach('file', buf, 'terms.pdf')
        .field('confirm_ownership', 'true')
        .field('field_values', JSON.stringify({ business_legal_name: 'Upload Co', business_address: '2 Paper St', cancellation_policy: 'flexible', governing_law: 'Ohio' }));

    expect(msg(await upload(Buffer.from('not a pdf')))).toMatch(/not a PDF/);
    expect(msg(await upload(Buffer.concat([vpdf, Buffer.from('trailer << /Encrypt 5 0 R >>')])))).toMatch(/Encrypted/);
    expect((await upload(Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(10 * 1024 * 1024 + 10)]))).status).toBeGreaterThanOrEqual(400);
    const ok = await upload(vpdf);
    expect(ok.status).toBe(201);
    expect(ok.body.data.file_sha256).toBe(sha(vpdf));

    const pbody = { listing_id: L.tent, vendor_id: U.vendor2, event_id: EVENT, event_start_at: start, event_end_at: end, timezone: 'UTC' };
    const { preview, booking } = await signedBooking(T.planner, pbody, 'Pat Planner');
    expect(preview.contract_type).toBe('UPLOADED');
    expect(preview.body).toContain('Event Planner');
    await signing();
    await http().patch(`/api/bookings/${booking.id}/confirm`).auth(T.vendor2, { type: 'bearer' })
      .send({ signature: sig('Uma Upload', preview.content_sha256) });

    const events = await http().get(`/api/contracts/event/${EVENT}`).auth(T.planner, { type: 'bearer' });
    expect(events.body.data[0].contract.status).toBe('EXECUTED');
    const zipLink = await http().get(`/api/contracts/event/${EVENT}/zip`).auth(T.planner, { type: 'bearer' });
    const zip = await JSZip.loadAsync((await fetchLink(zipLink.body.data.url)).body);
    expect(Object.keys(zip.files)).toHaveLength(1);
  });

  it('admin sees the audit log (and is logged) and can disable an uploaded contract', async () => {
    const res = await http().get(`/api/admin/contracts/bookings/${bookingId}`).auth(T.admin, { type: 'bearer' });
    const again = await http().get(`/api/admin/contracts/bookings/${bookingId}`).auth(T.admin, { type: 'bearer' });
    expect(res.status).toBe(200);
    const actions = again.body.data.flatMap((c: any) => c.auditEvents.map((e: any) => e.action));
    expect(actions).toEqual(expect.arrayContaining(['CREATED', 'SIGNED', 'COUNTERSIGNED', 'EXECUTED', 'DOWNLOADED', 'VERIFIED', 'ADMIN_VIEWED', 'SUPERSEDED']));

    const uploaded = await prisma.vendorContract.findFirst({ where: { vendor_id: U.vendor2, type: 'UPLOADED' } });
    const dis = await http().post(`/api/admin/contracts/vendor-contracts/${uploaded.id}/disable`).auth(T.admin, { type: 'bearer' }).send({ reason: 'Unlawful clause' });
    expect(dis.status).toBe(201);
    const mine = await http().get('/api/vendor/contracts').auth(T.vendor2, { type: 'bearer' });
    expect(mine.body.data.active[0].type).toBe('DEFAULT');
  });

  it('executed contracts survive account deletion while other personal data is removed', async () => {
    const del = await http().delete('/api/auth/account').auth(T.cust, { type: 'bearer' }).send({ confirm: 'DELETE' });
    expect(del.body.anonymized).toBe(true);

    const user = await prisma.user.findUnique({ where: { id: U.cust } });
    expect(user).toMatchObject({ name: 'Deleted user', phone_number: null, password: null });
    expect(user.email).not.toContain('@t.test');

    const link = await http().get(`/api/contracts/${contractId}/download`).auth(T.vendor, { type: 'bearer' });
    expect(sha((await fetchLink(link.body.data.url)).body)).toBe(executedHash);
    const sigs = await prisma.contractSignature.findMany({ where: { booking_contract_id: contractId } });
    expect(sigs.map((s: any) => s.legal_name)).toContain('Carl Customer');

    const gone = await http().delete('/api/auth/account').auth(T.stranger2, { type: 'bearer' }).send({ confirm: 'DELETE' });
    expect(gone.body.anonymized).toBeFalsy();
    expect(await prisma.user.findUnique({ where: { id: U.stranger2 } })).toBeNull();
  });

  it('signature and audit rows are write-once in the database', async () => {
    await expect(prisma.contractSignature.updateMany({ where: { booking_contract_id: contractId }, data: { legal_name: 'Forged' } })).rejects.toThrow(/write-once/);
    await expect(prisma.contractAuditEvent.deleteMany({ where: { booking_contract_id: contractId } })).rejects.toThrow(/cannot be deleted/);
    await expect(prisma.bookingContract.update({ where: { id: contractId }, data: { executed_pdf_sha256: 'f'.repeat(64) } })).rejects.toThrow(/write-once/);
  });
});
