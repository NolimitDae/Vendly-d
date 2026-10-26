/**
 * Vendor social links against a real Postgres: a vendor saves handles and links from the profile
 * form, they come back as full links on /auth/me and on the public shop, a wrong link is refused
 * without saving anything, an empty field clears its link, and customers can't set them.
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... yarn test:e2e vendor-socials
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;
const SECRET = 'vendor-socials-e2e-secret';

if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_vendor_socials_e2e';
  process.env.APP_URL = 'http://vendor-socials.test';
  process.env.CLIENT_APP_URL = 'http://localhost:3000';
}

jest.setTimeout(120_000);

run('Vendor social links (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  const id = randomBytes(4).toString('hex');
  const U = { vendor: `vsv-${id}`, customer: `vsc-${id}` };
  const token = (uid: string, type: string) => jwt.sign({ sub: uid, email: `${uid}@t.test`, type }, SECRET);
  const http = () => request(app.getHttpServer());
  const update = (uid: string, type: string, fields: Record<string, string>) => {
    const r = http().patch('/api/auth/update').auth(token(uid, type), { type: 'bearer' });
    for (const [k, v] of Object.entries(fields)) r.field(k, v);
    return r;
  };
  const socialsOf = async (uid: string) =>
    prisma.vendorProfile.findUnique({ where: { user_id: uid }, select: { website: true, instagram: true, tiktok: true, facebook: true, youtube: true, x: true } });

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
      data: [
        { id: U.vendor, email: `${U.vendor}@t.test`, name: 'Bella', type: 'VENDOR', email_verified_at: new Date() },
        { id: U.customer, email: `${U.customer}@t.test`, name: 'Carl', type: 'CUSTOMER', email_verified_at: new Date() },
      ],
    });
    await prisma.vendorProfile.create({ data: { user_id: U.vendor, license_photo: [], business_name: "Bella's Catering" } });
  });

  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { id: { in: Object.values(U) } } });
    await app?.close();
  });

  it('saves handles and links as full links, shown on /auth/me and the public shop', async () => {
    const res = await update(U.vendor, 'VENDOR', {
      website: 'bellas.com',
      instagram: '@bellas.catering',
      tiktok: 'https://www.tiktok.com/@bellas_eats?lang=en',
      x: '@bella',
    }).expect(200);
    expect(res.body.success).not.toBe(false);

    const want = {
      website: 'https://bellas.com/',
      instagram: 'https://www.instagram.com/bellas.catering',
      tiktok: 'https://www.tiktok.com/@bellas_eats',
      facebook: null,
      youtube: null,
      x: 'https://x.com/bella',
    };
    const me = await http().get('/api/auth/me').auth(token(U.vendor, 'VENDOR'), { type: 'bearer' }).expect(200);
    expect(me.body.data.socials).toEqual(want);
    const shop = await http().get(`/api/marketplace/vendors/${U.vendor}`).expect(200);
    expect(shop.body.data.socials).toEqual(want);
  });

  it('refuses a link that points somewhere else, saving nothing from that request', async () => {
    const res = await update(U.vendor, 'VENDOR', { business_name: 'Renamed', instagram: 'https://evil.example/instagram.com/bella' }).expect(200);
    expect(res.body).toMatchObject({ success: false, message: expect.stringMatching(/Instagram/) });
    expect((await socialsOf(U.vendor)).instagram).toBe('https://www.instagram.com/bellas.catering');
    expect((await prisma.vendorProfile.findUnique({ where: { user_id: U.vendor } })).business_name).toBe("Bella's Catering");

    const js = await update(U.vendor, 'VENDOR', { website: 'javascript:alert(1)' }).expect(200);
    expect(js.body.success).toBe(false);
    expect((await socialsOf(U.vendor)).website).toBe('https://bellas.com/');
  });

  it('clears a link when its field is sent empty, leaving the others', async () => {
    await update(U.vendor, 'VENDOR', { instagram: '' }).expect(200);
    expect(await socialsOf(U.vendor)).toMatchObject({ instagram: null, website: 'https://bellas.com/', x: 'https://x.com/bella' });
  });

  it("ignores social fields from a customer (they don't have a shop)", async () => {
    await update(U.customer, 'CUSTOMER', { instagram: '@carl' }).expect(200);
    expect(await prisma.vendorProfile.findUnique({ where: { user_id: U.customer } })).toBeNull();
  });
});
