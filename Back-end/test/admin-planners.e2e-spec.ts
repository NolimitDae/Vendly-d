/**
 * Admin event planner list, details and suspending, against a real Postgres + Redis.
 * Runs only when CONTRACTS_E2E_DATABASE_URL points at a migrated, disposable database:
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... yarn test:e2e admin-planners
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { signedIn } from './e2e-sessions';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;
const SECRET = 'planners-e2e-secret';

if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_planners_e2e';
  process.env.APP_URL = 'http://planners.test';
  process.env.CLIENT_APP_URL = 'http://localhost:3000';
}

jest.setTimeout(240_000);

run('Admin event planners (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  const id = randomBytes(4).toString('hex');
  const U = { admin: `pa-${id}`, approved: `pp1-${id}`, pending: `pp2-${id}`, noProfile: `pp3-${id}`, vendor: `pv-${id}` };
  const types: Record<string, string> = { admin: 'ADMIN', approved: 'EVENT_PLANNER', pending: 'EVENT_PLANNER', noProfile: 'EVENT_PLANNER', vendor: 'VENDOR' };
  const token = (k: keyof typeof U) => jwt.sign({ sub: U[k], email: `${U[k]}@t.test`, type: types[k] }, SECRET);
  const http = () => request(app.getHttpServer());
  const asAdmin = (r: request.Test) => r.auth(token('admin'), { type: 'bearer' });
  const search = `planner-${id}`;

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module');
    const { PrismaService } = await import('../src/prisma/prisma.service');
    // main.ts sets storage up; licence links need it
    const { TanvirStorage } = await import('../src/common/lib/Disk/TanvirStorage');
    TanvirStorage.config({ driver: 'local', connection: { rootUrl: `/tmp/planners-e2e-${process.pid}`, publicUrl: 'http://planners.test/storage' } });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
    await signedIn(app, Object.values(U));
    prisma = app.get(PrismaService);

    const password = await bcrypt.hash('secret123', 4);
    await prisma.user.createMany({
      data: Object.entries(U).map(([k, uid]) => ({
        id: uid,
        email: `${uid}@t.test`,
        name: `${k} ${search}`,
        type: types[k],
        password,
        email_verified_at: new Date(),
      })),
    });
    await prisma.eventPlannerProfile.create({ data: { user_id: U.approved, business_name: 'Bright Days', license_status: 'APPROVED', approved_at: new Date(), license_photo: ['lic.pdf'] } });
    await prisma.eventPlannerProfile.create({ data: { user_id: U.pending, business_name: 'Soon Events', license_status: 'PENDING' } });
    await prisma.event.create({ data: { event_planner_id: U.approved, name: 'Spring gala' } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.notification.deleteMany({ where: { receiver_id: { in: Object.values(U) } } });
      await prisma.user.deleteMany({ where: { id: { in: Object.values(U) } } });
    }
    await app?.close();
  });

  it('lists every planner (not vendors) with counts per status', async () => {
    const res = await asAdmin(http().get(`/api/admin/user/planners?search=${search}&limit=50`)).expect(200);
    const ids = res.body.data.map((p: any) => p.id).sort();
    expect(ids).toEqual([U.approved, U.noProfile, U.pending].sort());
    expect(res.body.counts).toEqual({ approved: 1, pending: 2, suspended: 0, rejected: 0 });
    const approved = res.body.data.find((p: any) => p.id === U.approved);
    expect(approved).toMatchObject({ planner_status: 'approved', business_name: 'Bright Days', total_events: 1 });
  });

  it('filters by status', async () => {
    const res = await asAdmin(http().get(`/api/admin/user/planners?search=${search}&status=pending`)).expect(200);
    expect(res.body.data.map((p: any) => p.id).sort()).toEqual([U.noProfile, U.pending].sort());
  });

  it('is admin only', async () => {
    await http().get('/api/admin/user/planners').auth(token('approved'), { type: 'bearer' }).expect(403);
  });

  it('suspends with a reason: sign-in and tokens stop working, the history shows it', async () => {
    const plannerToken = token('approved');
    await http().get('/api/auth/me').auth(plannerToken, { type: 'bearer' }).expect(200);

    await asAdmin(http().patch(`/api/admin/users/${U.approved}/status`).send({ status: 0, reason: 'Fake reviews' })).expect(200);

    await http().get('/api/auth/me').auth(plannerToken, { type: 'bearer' }).expect(401);
    const login = await http().post('/api/auth/login').send({ email: `${U.approved}@t.test`, password: 'secret123' });
    expect(login.status).toBe(401);
    expect(JSON.stringify(login.body)).toMatch(/suspended/);

    const list = await asAdmin(http().get(`/api/admin/user/planners?search=${search}&status=suspended`)).expect(200);
    expect(list.body.data.map((p: any) => p.id)).toEqual([U.approved]);

    const detail = await asAdmin(http().get(`/api/admin/user/planners/${U.approved}`)).expect(200);
    expect(detail.body.data.planner_status).toBe('suspended');
    expect(detail.body.data.profile.documents).toHaveLength(1);
    expect(detail.body.data.events.total).toBe(1);
    expect(detail.body.data.history[0]).toMatchObject({ event: 'suspended', note: 'Fake reviews' });

    await asAdmin(http().patch(`/api/admin/users/${U.approved}/status`).send({ status: 1 })).expect(200);
    const after = await asAdmin(http().get(`/api/admin/user/planners/${U.approved}`)).expect(200);
    expect(after.body.data.planner_status).toBe('approved');
    expect(after.body.data.history[0]).toMatchObject({ event: 'restored', note: null });
  });

  it('is not found for a vendor', async () => {
    await asAdmin(http().get(`/api/admin/user/planners/${U.vendor}`)).expect(404);
  });
});
