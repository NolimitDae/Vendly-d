import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { QuoteStatus } from 'prisma/generated/enums';
import { ChatExtrasService } from './chat-extras.service';

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({ TanvirStorage: { url: (p: string) => `https://cdn.test/${p}` } }));
jest.mock('src/config/app.config', () => ({ __esModule: true, default: () => ({ storageUrl: { avatar: 'avatar', attachment: 'attachment' } }) }));

const emit = jest.fn();
const gateway: any = { server: { to: jest.fn(() => ({ emit })) } };
const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
const prisma: any = {
  event: { findUnique: jest.fn() },
  conversation: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  participant: { create: jest.fn() },
  message: { create: jest.fn(), findFirst: jest.fn() },
  vendorListing: { findFirst: jest.fn() },
  quote: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
};

const event = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  name: 'Ada & Tobi Wedding',
  event_planner_id: 'planner',
  bookings: [{ booking: { vendor_id: 'v1', vendor: { name: 'Nia Glam' } } }, { booking: { vendor_id: 'v2', vendor: { name: 'Lens Co' } } }],
  conversation: null,
  ...over,
});

describe('ChatExtrasService', () => {
  let service: ChatExtrasService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.message.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'm', createdAt: new Date(), ...data, sender: { id: data.senderId, name: 'x' } }));
    service = new ChatExtrasService(prisma, gateway, push as any);
  });

  describe('event chat', () => {
    it('creates the group with the planner and every accepted vendor', async () => {
      prisma.event.findUnique.mockResolvedValue(event());
      prisma.conversation.create.mockResolvedValue({ id: 'c1' });
      const id = await service.syncEventChat('e1');
      expect(id).toBe('c1');
      expect(prisma.conversation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ is_group: true, event_id: 'e1', title: 'Ada & Tobi Wedding' }) });
      expect(prisma.participant.create).toHaveBeenCalledTimes(2);
      expect(prisma.message.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: 'system', text: 'Nia Glam joined the event chat.' }) }));
      expect(push.sendToUser).toHaveBeenCalledWith('v2', expect.anything());
    });

    it('only adds vendors who are not in it yet', async () => {
      prisma.event.findUnique.mockResolvedValue(event({ conversation: { id: 'c1', participants: [{ userId: 'planner' }, { userId: 'v1' }] } }));
      await service.syncEventChat('e1');
      expect(prisma.conversation.create).not.toHaveBeenCalled();
      expect(prisma.participant.create).toHaveBeenCalledTimes(1);
      expect(prisma.participant.create).toHaveBeenCalledWith({ data: { conversationId: 'c1', userId: 'v2', role: 'vendor' } });
    });

    it('waits for a vendor unless the planner opens it', async () => {
      prisma.event.findUnique.mockResolvedValue(event({ bookings: [] }));
      expect(await service.syncEventChat('e1')).toBeNull();
      prisma.event.findUnique.mockResolvedValueOnce({ event_planner_id: 'planner', conversation: null }).mockResolvedValueOnce(event({ bookings: [] }));
      prisma.conversation.create.mockResolvedValue({ id: 'c9' });
      expect((await service.openEventChat('e1', 'planner')).data.conversation_id).toBe('c9');
    });

    it('keeps strangers out', async () => {
      prisma.event.findUnique.mockResolvedValue({ event_planner_id: 'planner', conversation: { id: 'c1', participants: [] } });
      await expect(service.openEventChat('e1', 'someone')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('pins', () => {
    it('pins a message from the chat and tells everyone', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'c1', participants: [], event: null });
      prisma.message.findFirst.mockResolvedValue({ id: 'm1', text: 'Load-in at 2pm', sender: { id: 'u', name: 'U' } });
      const res = await service.pin('c1', 'u', 'm1');
      expect(prisma.conversation.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { pinned_message_id: 'm1' } });
      expect(res.data.pinned?.text).toBe('Load-in at 2pm');
      expect(emit).toHaveBeenCalledWith('pinned', expect.objectContaining({ conversation_id: 'c1' }));
    });
  });

  describe('quotes', () => {
    const oneToOne = { id: 'c1', is_group: false, event_id: null, participants: [{ userId: 'v1' }, { userId: 'cust' }], event: null };

    it('sends a quote card to the customer in a 1:1 chat', async () => {
      prisma.conversation.findFirst.mockResolvedValue(oneToOne);
      prisma.vendorListing.findFirst.mockResolvedValue({ id: 'l1' });
      prisma.quote.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'q1', ...data, status: 'PENDING' }));
      await service.createQuote('c1', 'v1', { listing_id: 'l1', title: 'Bridal party of 6', amount: 899.999, expires_in_days: 90 });
      const data = prisma.quote.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ customer_id: 'cust', vendor_id: 'v1', amount: 900 });
      expect(data.expires_at.getTime()).toBeLessThanOrEqual(Date.now() + 30 * 86400000 + 1000); // capped at 30 days
      expect(prisma.message.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: 'quote', quote_id: 'q1' }) }));
      expect(push.sendToUser).toHaveBeenCalledWith('cust', expect.anything());
    });

    it('quotes the planner in an event chat', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'c2', is_group: true, event_id: 'e1', participants: [{ userId: 'v1' }, { userId: 'v2' }, { userId: 'planner' }], event: { event_planner_id: 'planner' } });
      prisma.vendorListing.findFirst.mockResolvedValue({ id: 'l1' });
      prisma.quote.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'q2', ...data }));
      await service.createQuote('c2', 'v1', { listing_id: 'l1', title: 'Extra hour', amount: 150 });
      expect(prisma.quote.create.mock.calls[0][0].data).toMatchObject({ customer_id: 'planner', event_id: 'e1' });
    });

    it('needs one of the vendor’s live packages', async () => {
      prisma.conversation.findFirst.mockResolvedValue(oneToOne);
      prisma.vendorListing.findFirst.mockResolvedValue(null);
      await expect(service.createQuote('c1', 'v1', { listing_id: 'other', title: 'x', amount: 10 })).rejects.toThrow(BadRequestException);
    });

    it('lets the customer decline and the vendor withdraw, once', async () => {
      prisma.quote.findUnique.mockResolvedValue({ id: 'q1', customer_id: 'cust', vendor_id: 'v1', conversation_id: 'c1' });
      prisma.quote.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      await expect(service.declineQuote('q1', 'cust')).resolves.toMatchObject({ data: { status: QuoteStatus.DECLINED } });
      await expect(service.withdrawQuote('q1', 'v1')).rejects.toThrow(/no longer open/);
      await expect(service.declineQuote('q1', 'v1')).rejects.toThrow(/not found/);
    });
  });
});
