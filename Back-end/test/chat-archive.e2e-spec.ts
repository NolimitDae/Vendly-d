/**
 * Chat archive against a real Postgres + Redis: a 1:1 chat can't be archived while the two people have a
 * booking under way, can be once it's completed; archiving is per person (hidden from my list only, listed
 * with ?archived=1) and a new message brings the chat back.
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... npx jest --config ./test/jest-e2e.json chat-archive --forceExit
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { signedIn } from './e2e-sessions';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;
const SECRET = 'chat-archive-e2e-secret';

if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_chat_archive_e2e';
  process.env.APP_URL = 'http://chat-archive.test';
  process.env.CLIENT_APP_URL = 'http://localhost:3000';
}

jest.setTimeout(240_000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

run('Chat archive (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  const id = randomBytes(4).toString('hex');
  const U = { vendor: `cav-${id}`, cust: `cac-${id}`, stranger: `cas-${id}` };
  const types: Record<keyof typeof U, string> = { vendor: 'VENDOR', cust: 'CUSTOMER', stranger: 'CUSTOMER' };
  const T = Object.fromEntries(
    Object.entries(U).map(([k, sub]) => [k, jwt.sign({ sub, email: `${sub}@t.test`, type: types[k as keyof typeof U] }, SECRET)]),
  ) as Record<keyof typeof U, string>;
  const LISTING = `cal-${id}`;
  let chat = '';
  let bookingId = '';

  // a short pause before each call keeps the run under the per-IP request limit (10 a second)
  const http = () => request(app.getHttpServer());
  const msg = (res: request.Response) => res.body?.message?.message ?? res.body?.message;
  const post = async (token: string, path: string, body: object = {}) => {
    await sleep(150);
    return http().post(`/api/chat/${path}`).auth(token, { type: 'bearer' }).send(body);
  };
  const say = (token: string, text: string) => post(token, 'message/send-message', { conversationId: chat, text });
  const list = async (token: string, query = '') => {
    await sleep(150);
    return http().get(`/api/chat/conversation/conversation-list${query}`).auth(token, { type: 'bearer' });
  };
  const ids = (res: request.Response) => res.body.conversations.map((c: any) => c.conversation_id);

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
    await signedIn(app, Object.values(U));
    prisma = app.get(PrismaService);

    await prisma.user.createMany({
      data: Object.entries(U).map(([k, uid]) => ({
        id: uid,
        email: `${uid}@t.test`,
        name: k === 'vendor' ? 'Bloom Florals' : k === 'cust' ? 'Cara Customer' : 'Sam Stranger',
        type: types[k as keyof typeof U],
        email_verified_at: new Date(),
      })),
    });
    await prisma.vendorListing.create({ data: { id: LISTING, vendor_id: U.vendor, title: 'Wedding Flowers', description: 'Full floral design', price: 900, status: 'ACTIVE' } });

    const res = await post(T.cust, 'conversation/create-conversation', { participant_id: U.vendor });
    expect(res.status).toBe(201);
    chat = res.body.conversation.conversation_id ?? res.body.conversation.id;
    expect((await say(T.cust, 'Hi! Are you free on June 14?')).status).toBe(201);
    expect((await say(T.vendor, 'Yes, June 14 works!')).status).toBe(201);
    // a booking accepted by the vendor (made directly: the booking flow has its own e2e)
    bookingId = (await prisma.booking.create({ data: { customer_id: U.cust, vendor_id: U.vendor, listing_id: LISTING, status: 'CONFIRMED', amount: 900 } })).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('refuses to archive while the booking is under way, for either person', async () => {
    const cust = await post(T.cust, `conversation/${chat}/archive`);
    expect(cust.status).toBe(400);
    expect(msg(cust)).toBe('You can archive this chat once your booking with Bloom Florals is finished.');

    const vendor = await post(T.vendor, `conversation/${chat}/archive`);
    expect(vendor.status).toBe(400);
    expect(msg(vendor)).toBe('You can archive this chat once your booking with Cara Customer is finished.');

    expect(ids(await list(T.cust))).toContain(chat);
  });

  it('keeps people outside the chat out', async () => {
    expect((await post(T.stranger, `conversation/${chat}/archive`)).status).toBe(404);
    expect((await post(T.stranger, `conversation/${chat}/unarchive`)).status).toBe(404);
  });

  it('once the booking is completed, archiving hides the chat from my list only', async () => {
    await prisma.booking.update({ where: { id: bookingId }, data: { status: 'COMPLETED' } });

    const res = await post(T.cust, `conversation/${chat}/archive`);
    expect(res.status).toBe(201);
    expect(res.body.data.archived_at).toBeTruthy();

    const mine = await list(T.cust);
    expect(ids(mine)).not.toContain(chat);
    expect(mine.body.archived_count).toBe(1);

    const archived = await list(T.cust, '?archived=1');
    expect(ids(archived)).toEqual([chat]);
    expect(archived.body.conversations[0].archived_at).toBeTruthy();

    // the vendor still has it, and the messages are all there
    const theirs = await list(T.vendor);
    expect(ids(theirs)).toContain(chat);
    expect(theirs.body.archived_count).toBe(0);
    await sleep(150);
    const thread = await http().get(`/api/chat/message/all-message/${chat}?page=1&perPage=50`).auth(T.cust, { type: 'bearer' });
    expect(thread.body.data).toHaveLength(2);
    expect(thread.body.conversation.archived_at).toBeTruthy();
  });

  it('comes back for me when the other person writes', async () => {
    expect((await say(T.vendor, 'Thanks again! Here are the photos from the day.')).status).toBe(201);
    const mine = await list(T.cust);
    expect(ids(mine)).toContain(chat);
    expect(mine.body.archived_count).toBe(0);
    expect(mine.body.conversations.find((c: any) => c.conversation_id === chat).unread).toBeGreaterThan(0);
  });

  it('comes back when I write in it myself, and can be moved back by hand', async () => {
    expect((await post(T.cust, `conversation/${chat}/archive`)).status).toBe(201);
    expect((await say(T.cust, 'One more thing about the invoice.')).status).toBe(201);
    expect(ids(await list(T.cust))).toContain(chat);

    expect((await post(T.cust, `conversation/${chat}/archive`)).status).toBe(201);
    const back = await post(T.cust, `conversation/${chat}/unarchive`);
    expect(back.status).toBe(201);
    expect(back.body.data.archived_at).toBeNull();
    expect(ids(await list(T.cust))).toContain(chat);
  });

  it("a vendor's archived chat leaves the inbox tabs and their counts", async () => {
    expect((await post(T.vendor, `conversation/${chat}/archive`)).status).toBe(201);
    const clients = await list(T.vendor, '?tab=clients');
    expect(ids(clients)).not.toContain(chat);
    expect(clients.body.counts.clients.total).toBe(0);
    expect(clients.body.archived_count).toBe(1);

    // the archived list is one list, whatever the tab
    expect(ids(await list(T.vendor, '?archived=1&tab=clients'))).toEqual([chat]);
  });
});
