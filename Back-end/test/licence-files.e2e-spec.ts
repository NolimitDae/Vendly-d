/**
 * Licence documents: private uploads, signed links for the owner and admins, and the move of old
 * public files, against a real Postgres + Redis.
 * Runs only when CONTRACTS_E2E_DATABASE_URL points at a migrated, disposable database:
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... yarn test:e2e licence-files
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as jwt from 'jsonwebtoken';
import * as path from 'path';
import * as request from 'supertest';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;
const SECRET = 'licences-e2e-secret';
const PUBLIC_DIR = `/tmp/licences-e2e-public-${process.pid}`;
const PRIVATE_DIR = `/tmp/licences-e2e-private-${process.pid}`;

if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_licences_e2e';
  process.env.APP_URL = 'http://licences.test';
  process.env.CLIENT_APP_URL = 'http://localhost:3000';
  process.env.PRIVATE_STORAGE_DIR = PRIVATE_DIR;
}

jest.setTimeout(240_000);

const PDF = Buffer.from('%PDF-1.4\n%test licence\n');
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

run('Licence files (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  const id = randomBytes(4).toString('hex');
  const U = { admin: `la-${id}`, vendor: `lv-${id}`, planner: `lp-${id}`, other: `lo-${id}` };
  const types: Record<string, string> = { admin: 'ADMIN', vendor: 'VENDOR', planner: 'EVENT_PLANNER', other: 'VENDOR' };
  const token = (k: keyof typeof U) => jwt.sign({ sub: U[k], email: `${U[k]}@t.test`, type: types[k] }, SECRET);
  const http = () => request(app.getHttpServer());
  const as = (k: keyof typeof U, r: request.Test) => r.auth(token(k), { type: 'bearer' });
  // links are absolute (APP_URL); the test server takes the path
  const pathOf = (url: string) => new URL(url).pathname;

  beforeAll(async () => {
    fs.mkdirSync(path.join(PUBLIC_DIR, 'event-planner', 'license'), { recursive: true });
    fs.writeFileSync(path.join(PUBLIC_DIR, 'event-planner', 'license', `old-${id}.jpg`), JPG);

    const { AppModule } = await import('../src/app.module');
    const { PrismaService } = await import('../src/prisma/prisma.service');
    const { TanvirStorage } = await import('../src/common/lib/Disk/TanvirStorage');
    TanvirStorage.config({ driver: 'local', connection: { rootUrl: PUBLIC_DIR, publicUrl: 'http://licences.test/storage' } });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.user.createMany({
      data: Object.entries(U).map(([k, uid]) => ({ id: uid, email: `${uid}@t.test`, name: `${k} ${id}`, type: types[k], email_verified_at: new Date() })),
    });
    await prisma.vendorProfile.create({ data: { user_id: U.vendor, business_name: `Licensed ${id}`, license_status: 'PENDING' } });
    // an older planner row: a bare file name of a copy in the public bucket
    await prisma.eventPlannerProfile.create({ data: { user_id: U.planner, business_name: `Planner ${id}`, license_status: 'APPROVED', approved_at: new Date(), license_photo: [`old-${id}.jpg`] } });
  });

  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { id: { in: Object.values(U) } } });
    await app?.close();
    fs.rmSync(PUBLIC_DIR, { recursive: true, force: true });
    fs.rmSync(PRIVATE_DIR, { recursive: true, force: true });
  });

  it('keeps a vendor licence private and links it only for the vendor and admins', async () => {
    const up = await as('vendor', http().post('/api/auth/add-license')).attach('license', PDF, { filename: 'licence.pdf', contentType: 'application/pdf' }).expect(201);
    const [own] = up.body.data.license_photo;
    expect(own).toMatch(/^http:\/\/licences\.test\/api\/licence-files\//);

    const row = await prisma.vendorProfile.findUnique({ where: { user_id: U.vendor } });
    expect(row.license_photo[0]).toMatch(new RegExp(`^licences/vendor/${U.vendor}/`));
    expect(fs.existsSync(path.join(PRIVATE_DIR, row.license_photo[0]))).toBe(true);
    // nothing in the public folder
    expect(fs.existsSync(path.join(PUBLIC_DIR, 'license'))).toBe(false);

    const file = await http().get(pathOf(own)).expect(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.headers['cache-control']).toBe('private, no-store');
    expect(file.headers['content-disposition']).toMatch(/^inline/);

    const pending = await as('admin', http().get('/api/admin/user/pending-license')).expect(200);
    const mine = pending.body.find((p: any) => p.id === U.vendor);
    await http().get(pathOf(mine.license_photo[0])).expect(200);

    // the public shop page has no licence data
    const shop = await http().get(`/api/marketplace/vendors/${U.vendor}`).expect(200);
    expect(JSON.stringify(shop.body)).not.toMatch(/license_photo|licence-files|licences\//);
  });

  it('refuses links for anyone else, expired links and keys outside licences/', async () => {
    const { SignedUrl } = await import('../src/modules/contracts/private-storage');
    const row = await prisma.vendorProfile.findUnique({ where: { user_id: U.vendor } });
    const key = row.license_photo[0];
    await http().get(`/api/licence-files/${SignedUrl.sign({ key, uid: U.other, cid: U.vendor, name: 'licence' })}`).expect(403);
    await http().get(`/api/licence-files/${SignedUrl.sign({ key, uid: U.vendor, cid: U.vendor, name: 'licence' }, -1)}`).expect(403);
    await http().get(`/api/licence-files/${SignedUrl.sign({ key: 'contracts/x/a.pdf', uid: U.admin, cid: U.vendor, name: 'licence' })}`).expect(403);
  });

  it('serves an old public planner licence through a signed link, and keeps it working after the move', async () => {
    const pending = await as('planner', http().get('/api/event-planner/profile/me')).expect(200);
    const [link] = pending.body.data.license_photo;
    const before = await http().get(pathOf(link)).expect(200);
    expect(before.headers['content-type']).toBe('image/jpeg');

    const pub = await http().get(`/api/event-planner/planners/${U.planner}`).expect(200);
    expect(JSON.stringify(pub.body)).not.toMatch(/license_photo|licence-files|old-/);

    const { LicenceFilesService } = await import('../src/modules/licence-files/licence-files.service');
    const moved = await app.get(LicenceFilesService).moveLegacy();
    expect(moved.moved).toBeGreaterThanOrEqual(1);
    const row = await prisma.eventPlannerProfile.findUnique({ where: { user_id: U.planner } });
    expect(row.license_photo).toEqual([`licences/planner/${U.planner}/legacy-old-${id}.jpg`]);
    expect(fs.existsSync(path.join(PUBLIC_DIR, 'event-planner', 'license', `old-${id}.jpg`))).toBe(false);

    // the link signed before the move still opens the file
    const after = await http().get(pathOf(link)).expect(200);
    expect(Buffer.from(after.body)).toEqual(JPG);
  });
});
