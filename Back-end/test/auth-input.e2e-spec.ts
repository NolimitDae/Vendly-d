/**
 * Auth endpoints only accept plain text, against a real Postgres + Redis: a query object sent instead of a
 * reset code must never match someone's code (which would let anyone reset any password).
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... yarn test:e2e auth-input
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import * as request from 'supertest';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;

if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = 'auth-input-e2e-secret';
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_auth_input_e2e';
  process.env.APP_URL = 'http://auth-input.test';
  process.env.CLIENT_APP_URL = 'http://localhost:3000';
}

jest.setTimeout(120_000);

run('Auth input (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  const id = randomBytes(4).toString('hex');
  const email = `victim-${id}@t.test`;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module');
    const { PrismaService } = await import('../src/prisma/prisma.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
    prisma = app.get(PrismaService);
    const user = await prisma.user.create({ data: { id: `victim-${id}`, email, name: 'Victim', type: 'CUSTOMER', password: await bcrypt.hash('original-pass', 4), email_verified_at: new Date() } });
    // a reset code the attacker doesn't know
    await prisma.ucode.create({ data: { user_id: user.id, email, token: '482913', expired_at: new Date(Date.now() + 15 * 60_000) } });
  });

  afterAll(async () => {
    await prisma?.ucode.deleteMany({ where: { email } });
    await prisma?.user.deleteMany({ where: { email } });
    await app?.close();
  });

  const crafted = [{ not: '' }, { contains: '' }, { startsWith: '4' }, { in: ['482913'] }];
  /** Refused outright, or turned into plain text that matches nothing. */
  const refused = (res: request.Response) => res.status === 400 || res.body?.success === false;

  it('refuses a query object instead of the reset code', async () => {
    for (const token of crafted) {
      const v = await http().post('/api/auth/verify-token').send({ email, token });
      expect(refused(v)).toBe(true);
      const r = await http().post('/api/auth/reset-password').send({ email, token, password: 'attacker-pass' });
      expect(refused(r)).toBe(true);
    }
    const code = await prisma.ucode.findFirst({ where: { email } });
    expect(code.verified_at).toBeNull();
    const user = await prisma.user.findFirst({ where: { email } });
    expect(await bcrypt.compare('original-pass', user.password)).toBe(true);
  });

  it('refuses objects for the email too, and at sign-in', async () => {
    // no code is sent to (or matched for) whoever a filter would pick
    const before = await prisma.ucode.count();
    await http().post('/api/auth/forgot-password').send({ email: { not: '' } });
    expect(await prisma.ucode.count()).toBe(before);
    expect(refused(await http().post('/api/auth/verify-token').send({ email: { contains: '@' }, token: '482913' }))).toBe(true);
    expect((await prisma.ucode.findFirst({ where: { email } })).verified_at).toBeNull();
    const login = await http().post('/api/auth/login').send({ email: { not: '' }, password: 'original-pass' });
    expect([400, 401]).toContain(login.status);
    expect(JSON.stringify(login.body)).not.toMatch(/access_token/);
  });

  it('still verifies the real code', async () => {
    const v = await http().post('/api/auth/verify-token').send({ email, token: '482913' });
    expect(v.status).toBeLessThan(300);
    expect(v.body.success).toBe(true);
  });
});
