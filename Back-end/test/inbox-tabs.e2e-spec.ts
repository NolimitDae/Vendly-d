/**
 * Vendor inbox tabs and the customer message limit against a real Postgres + Redis: a customer can
 * send 3 messages to a vendor until the vendor replies, then as many as they like; a booking request
 * moves the chat from the vendor's Inquiries to Clients, with both tabs' counts kept right.
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... npx jest --config ./test/jest-e2e.json inbox-tabs --forceExit
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;
const SECRET = 'inbox-tabs-e2e-secret';

if (DB) {
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_inbox_tabs_e2e';
  process.env.APP_URL = 'http://inbox-tabs.test';
  process.env.CLIENT_APP_URL = 'http://localhost:3000';
}

jest.setTimeout(240_000);

const SIGNATURE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAiElEQVR42u2XWwrAMAgEc/9L2xOEYh67G5iBfFbHVMSMAQAAAHCfmhy3k61w9yVIclfjuLpRVrxVxpGvk0QlFVm8Ui62eIXgNHaFtdjpTviNdypZvRor/a9JvHaS3Rxe0nmyUkjq5F726nyoXGCkO0X69ibxSt/fJV7JLziZV+IbPtkLAADgJT6abb9BSgfpowAAAABJRU5ErkJggg==';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

run('Vendor inbox tabs and the customer message limit (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  const id = randomBytes(4).toString('hex');
  const U = { vendor: `ibv-${id}`, cust: `ibc-${id}`, asker: `iba-${id}`, accepted: `ibk-${id}` };
  const types: Record<keyof typeof U, string> = { vendor: 'VENDOR', cust: 'CUSTOMER', asker: 'CUSTOMER', accepted: 'CUSTOMER' };
  const T = Object.fromEntries(
    Object.entries(U).map(([k, sub]) => [k, jwt.sign({ sub, email: `${sub}@t.test`, type: types[k as keyof typeof U] }, SECRET)]),
  ) as Record<keyof typeof U, string>;
  const LISTING = `ibl-${id}`;
  const chats: Partial<Record<keyof typeof U, string>> = {};

  const http = () => request(app.getHttpServer());
  const msg = (res: request.Response) => res.body?.message?.message ?? res.body?.message;
  // a short pause keeps the run under the per-IP request limit (10 a second)
  const say = async (token: string, conversationId: string, text: string) => {
    await sleep(150);
    return http().post('/api/chat/message/send-message').auth(token, { type: 'bearer' }).send({ conversationId, text });
  };
  const inbox = (tab?: string) =>
    http().get(`/api/chat/conversation/conversation-list${tab ? `?tab=${tab}` : ''}`).auth(T.vendor, { type: 'bearer' });
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
    prisma = app.get(PrismaService);

    await prisma.user.createMany({
      data: Object.entries(U).map(([k, uid]) => ({
        id: uid,
        email: `${uid}@t.test`,
        name: k === 'vendor' ? 'Bloom Florals' : `${k} user`,
        type: types[k as keyof typeof U],
        email_verified_at: new Date(),
      })),
    });
    await prisma.vendorProfile.create({ data: { user_id: U.vendor, business_name: 'Bloom Florals LLC', address: '1 Petal Way' } });
    await prisma.vendorListing.create({ data: { id: LISTING, vendor_id: U.vendor, title: 'Wedding Flowers', description: 'Full floral design', price: 900, status: 'ACTIVE' } });
    const vc = await http().post('/api/vendor/contracts/default').auth(T.vendor, { type: 'bearer' }).send({
      category: 'PHOTO_VIDEO',
      field_values: {
        business_legal_name: 'Bloom Florals LLC', business_address: '1 Petal Way', cancellation_policy: 'moderate',
        governing_law: 'Texas, USA', delivery_time_days: '30', revisions_included: '2', usage_rights: 'personal',
      },
    });
    if (vc.status !== 201) throw new Error(`vendor contract: ${vc.status} ${JSON.stringify(vc.body)}`);

    // each customer opens a chat with the vendor
    for (const k of ['cust', 'asker', 'accepted'] as const) {
      const res = await http().post('/api/chat/conversation/create-conversation').auth(T[k], { type: 'bearer' }).send({ participant_id: U.vendor });
      expect(res.status).toBe(201);
      chats[k] = res.body.conversation.conversation_id ?? res.body.conversation.id;
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  it('a customer can send 3 messages before the vendor replies, then is stopped with a clear reason', async () => {
    const first = await say(T.cust, chats.cust!, 'Hi! Are you free on June 14?');
    expect(first.status).toBe(201);
    expect(first.body.send_limit).toMatchObject({ limit: 3, used: 1, remaining: 2, vendor_name: 'Bloom Florals' });
    expect((await say(T.cust, chats.cust!, 'It is for about 80 guests.')).body.send_limit.remaining).toBe(1);
    expect((await say(T.cust, chats.cust!, 'Mostly white roses.')).body.send_limit.remaining).toBe(0);

    const fourth = await say(T.cust, chats.cust!, 'Hello?');
    expect(fourth.status).toBe(403);
    expect(msg(fourth)).toBe("You can send 3 messages until Bloom Florals replies. They'll get back to you soon.");
    expect(await prisma.message.count({ where: { conversationId: chats.cust, senderId: U.cust } })).toBe(3);

    // the chat screen learns it from the message list too
    const list = await http().get(`/api/chat/message/all-message/${chats.cust}?page=1&perPage=50`).auth(T.cust, { type: 'bearer' });
    expect(list.body.conversation.send_limit).toMatchObject({ used: 3, remaining: 0 });
    // the vendor is never limited
    const vendorView = await http().get(`/api/chat/message/all-message/${chats.cust}?page=1&perPage=50`).auth(T.vendor, { type: 'bearer' });
    expect(vendorView.body.conversation.send_limit).toBeNull();
  });

  it('once the vendor replies, the customer can send again with no limit', async () => {
    const reply = await say(T.vendor, chats.cust!, 'Yes, June 14 works!');
    expect(reply.status).toBe(201);
    expect(reply.body.send_limit).toBeNull();

    const again = await say(T.cust, chats.cust!, 'Great, sending a request now.');
    expect(again.status).toBe(201);
    expect(again.body.send_limit).toBeNull();
    expect((await say(T.cust, chats.cust!, 'And one more thing.')).status).toBe(201);
  });

  it('an accepted booking lifts the limit too', async () => {
    for (const t of ['One', 'Two', 'Three']) expect((await say(T.accepted, chats.accepted!, t)).status).toBe(201);
    expect((await say(T.accepted, chats.accepted!, 'Four')).status).toBe(403);
    // the vendor accepted a booking with this customer (made directly: the booking flow has its own e2e)
    await prisma.booking.create({ data: { customer_id: U.accepted, vendor_id: U.vendor, listing_id: LISTING, status: 'CONFIRMED', amount: 900 } });
    expect((await say(T.accepted, chats.accepted!, 'Four')).status).toBe(201);
  });

  it('before any booking request, chats sit in Inquiries with the right counts', async () => {
    await say(T.asker, chats.asker!, 'Do you do table centrepieces?');

    const inquiries = await inbox('inquiries');
    expect(inquiries.status).toBe(200);
    expect(ids(inquiries)).toEqual(expect.arrayContaining([chats.cust, chats.asker]));
    expect(ids(inquiries)).not.toContain(chats.accepted);
    expect(inquiries.body.counts.inquiries).toMatchObject({ total: 2, unread: 2 });

    const clients = await inbox('clients');
    expect(ids(clients)).toEqual([chats.accepted]);
    expect(clients.body.conversations[0]).toMatchObject({ tab: 'clients', current_booking: true });
    expect(clients.body.counts.clients).toMatchObject({ total: 1, unread: 1 });

    // callers that don't ask for a tab get the whole list, as before
    const all = await inbox();
    expect(all.body.counts).toBeUndefined();
    expect(ids(all)).toHaveLength(3);
  });

  it("a booking request moves the customer's chat to Clients, current bookings first", async () => {
    const start = new Date(Date.now() + 45 * 86400e3);
    start.setUTCHours(22, 0, 0, 0);
    const body = {
      listing_id: LISTING, vendor_id: U.vendor, timezone: 'America/Chicago',
      event_start_at: start, event_end_at: new Date(start.getTime() + 5 * 3600e3), venue_address: 'Grand Hall, Austin TX', guest_count: 80,
    };
    const pv = await http().post('/api/contracts/booking-preview').auth(T.cust, { type: 'bearer' }).send(body);
    expect(pv.status).toBe(201);
    // signing endpoints are rate limited per IP
    await sleep(2100);
    const sent = await http().post('/api/bookings').auth(T.cust, { type: 'bearer' }).send({
      ...body,
      preview_token: pv.body.data.preview_token,
      // a drawn signature (1x1 PNG) is required to sign
      signature: { legal_name: 'Cara Customer', consent: true, content_sha256: pv.body.data.content_sha256, device_platform: 'web', signature_image: SIGNATURE_PNG },
    });
    expect(sent.status).toBe(201);

    // the vendor reads the customer's chat: its unread count goes
    await http().post(`/api/chat/message/read-message/${chats.cust}`).auth(T.vendor, { type: 'bearer' }).expect(201);

    const clients = await inbox('clients');
    expect(ids(clients)).toEqual(expect.arrayContaining([chats.cust, chats.accepted]));
    expect(ids(clients)).toHaveLength(2);
    expect(clients.body.conversations.every((c: any) => c.current_booking)).toBe(true);
    expect(clients.body.counts).toEqual({
      // the accepted customer's 4 messages are still unread
      clients: { total: 2, unread: 1, unread_messages: 4 },
      inquiries: { total: 1, unread: 1, unread_messages: 1 },
    });
    expect(ids(await inbox('inquiries'))).toEqual([chats.asker]);

    // a client whose booking is over goes after the current ones
    await prisma.booking.updateMany({ where: { customer_id: U.accepted, vendor_id: U.vendor }, data: { status: 'COMPLETED' } });
    const later = await inbox('clients');
    expect(ids(later)).toEqual([chats.cust, chats.accepted]);
    expect(later.body.conversations[1].current_booking).toBe(false);
  });

  it('refuses an unknown tab', async () => {
    const res = await inbox('everyone');
    expect(res.status).toBe(400);
  });
});
