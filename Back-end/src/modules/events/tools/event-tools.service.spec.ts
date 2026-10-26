import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventToolsService } from './event-tools.service';

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({ TanvirStorage: { url: (p: string) => `https://cdn.test/${p}` } }));
jest.mock('src/config/app.config', () => ({ __esModule: true, default: () => ({ app: { url: 'https://api.test', client_app_url: 'https://app.test' }, storageUrl: { avatar: 'a', attachment: 'b' } }) }));
jest.mock('src/modules/contracts/private-storage', () => ({
  PrivateStorage: { newKey: (f: string, e: string) => `${f}/k.${e}`, put: jest.fn(), get: jest.fn().mockResolvedValue(Buffer.from('x')) },
  SignedUrl: { sign: () => 'signed', verify: jest.fn() },
}));

const prisma: any = {
  event: { findUnique: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  eventTimelineItem: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
  eventFile: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  eventBooking: { findMany: jest.fn().mockResolvedValue([]) },
  budgetItem: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), create: jest.fn() },
  booking: { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  vendorTeam: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  conversation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  message: { create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  userBlock: { findMany: jest.fn().mockResolvedValue([]) },
  bookingContract: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
};
const mail = { sendBookingNotification: jest.fn().mockResolvedValue(undefined) };
const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
const emit = jest.fn();
const gateway: any = { server: { to: jest.fn(() => ({ emit })) } };

const event = (over: Record<string, unknown> = {}) => ({
  id: 'e1', name: 'Ada & Tobi Wedding', date: new Date('2026-11-14'), venue: 'The Grove', event_planner_id: 'planner', client_email: 'Ada@Example.com', client_sees_budget: false, total_budget: 20000,
  bookings: [{ booking: { vendor_id: 'v1' } }],
  ...over,
});

describe('EventToolsService', () => {
  let service: EventToolsService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.event.findUnique.mockResolvedValue(event());
    service = new EventToolsService(prisma, mail as any, push as any, gateway);
  });

  describe('access', () => {
    it('knows the planner, a booked vendor and the client (email match, any case)', async () => {
      expect((await service.access('e1', 'planner')).role).toBe('planner');
      expect((await service.access('e1', 'v1')).role).toBe('vendor');
      prisma.user.findUnique.mockResolvedValueOnce({ email: 'ada@example.com' });
      expect((await service.access('e1', 'ada')).role).toBe('client');
    });

    it('keeps everyone else out', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ email: 'someone@else.com' });
      await expect(service.access('e1', 'stranger')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('on a cancelled event (read-only)', () => {
    const READ_ONLY = "This event was cancelled, so it can't be changed. You can still view everything on it.";
    beforeEach(() => prisma.event.findUnique.mockResolvedValue(event({ status: 'CANCELLED' })));

    it('refuses run-of-show changes', async () => {
      prisma.eventTimelineItem.findFirst.mockResolvedValue({ id: 't1', vendor_id: 'v1' });
      await expect(service.addTimelineItem('e1', 'planner', { starts_at: '2026-11-14T14:00:00Z', title: 'Load-in' })).rejects.toThrow(new BadRequestException(READ_ONLY));
      await expect(service.updateTimelineItem('e1', 't1', 'planner', { title: 'X' })).rejects.toThrow(READ_ONLY);
      await expect(service.updateTimelineItem('e1', 't1', 'v1', { done: true })).rejects.toThrow(READ_ONLY);
      await expect(service.deleteTimelineItem('e1', 't1', 'planner')).rejects.toThrow(READ_ONLY);
      expect(prisma.eventTimelineItem.create).not.toHaveBeenCalled();
      expect(prisma.eventTimelineItem.update).not.toHaveBeenCalled();
      expect(prisma.eventTimelineItem.deleteMany).not.toHaveBeenCalled();
    });

    it('refuses file uploads and removals', async () => {
      prisma.eventFile.findFirst.mockResolvedValue({ id: 'f1', uploaded_by: 'planner' });
      const file = { originalname: 'plan.pdf', size: 10, buffer: Buffer.from('x'), mimetype: 'application/pdf' } as any;
      await expect(service.uploadFiles('e1', 'v1', [file])).rejects.toThrow(READ_ONLY);
      await expect(service.deleteFile('e1', 'f1', 'planner')).rejects.toThrow(READ_ONLY);
      expect(prisma.eventFile.create).not.toHaveBeenCalled();
      expect(prisma.eventFile.delete).not.toHaveBeenCalled();
    });

    it('refuses team invites', async () => {
      prisma.vendorTeam.findFirst.mockResolvedValue({ id: 'team', vendor_ids: ['v1'] });
      await expect(service.inviteTeam('e1', 'planner', 'team')).rejects.toThrow(READ_ONLY);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('still lets everyone read the run of show, files and overview', async () => {
      await expect(service.timeline('e1', 'v1')).resolves.toMatchObject({ success: true });
      await expect(service.files('e1', 'planner')).resolves.toMatchObject({ success: true });
      prisma.user.findUnique.mockResolvedValue({ id: 'planner', name: 'P' });
      await expect(service.overview('e1', 'planner')).resolves.toMatchObject({ success: true });
    });
  });

  describe('run of show', () => {
    it('lets the planner add items assigned to booked vendors only', async () => {
      prisma.eventTimelineItem.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 't1', ...data, vendor: null }));
      await service.addTimelineItem('e1', 'planner', { starts_at: '2026-11-14T14:00:00Z', title: 'Load-in', vendor_id: 'v1' });
      expect(prisma.eventTimelineItem.create).toHaveBeenCalled();
      expect(push.sendToUser).toHaveBeenCalledWith('v1', expect.anything(), 'booking_updates');
      await expect(service.addTimelineItem('e1', 'planner', { starts_at: '2026-11-14T14:00:00Z', title: 'X', vendor_id: 'v9' })).rejects.toThrow(BadRequestException);
      await expect(service.addTimelineItem('e1', 'planner', { starts_at: '2026-11-14T14:00:00Z', ends_at: '2026-11-14T13:00:00Z', title: 'X' })).rejects.toThrow(/after the start/);
    });

    it('lets a vendor tick off their own item but not edit it', async () => {
      prisma.eventTimelineItem.findFirst.mockResolvedValue({ id: 't1', vendor_id: 'v1' });
      prisma.eventTimelineItem.update.mockResolvedValue({ id: 't1', done: true });
      await service.updateTimelineItem('e1', 't1', 'v1', { done: true });
      expect(prisma.eventTimelineItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: { done: true } }));
      await expect(service.updateTimelineItem('e1', 't1', 'v1', { title: 'Mine now' })).rejects.toThrow(ForbiddenException);
    });

    it('stops the client adding items', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: 'ada@example.com' });
      await expect(service.addTimelineItem('e1', 'ada', { starts_at: '2026-11-14T14:00:00Z', title: 'X' })).rejects.toThrow(/Only the planner/);
    });
  });

  describe('files', () => {
    const file = (over: Record<string, unknown> = {}) => ({ originalname: 'floor-plan.pdf', size: 1000, mimetype: 'application/pdf', buffer: Buffer.from('x'), ...over }) as any;

    it('planner and vendors upload; the client only views', async () => {
      prisma.eventFile.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'f1', ...data }));
      await service.uploadFiles('e1', 'v1', [file()]);
      expect(prisma.eventFile.create).toHaveBeenCalledWith({ data: expect.objectContaining({ key: 'events/e1/k.pdf', uploaded_by: 'v1' }) });
      prisma.user.findUnique.mockResolvedValue({ email: 'ada@example.com' });
      await expect(service.uploadFiles('e1', 'ada', [file()])).rejects.toThrow(/not upload/);
    });

    it('refuses files over 20 MB', async () => {
      await expect(service.uploadFiles('e1', 'planner', [file({ size: 21 * 1024 * 1024 })])).rejects.toThrow(/over 20 MB/);
    });

    it('only the planner or the uploader can delete', async () => {
      prisma.eventFile.findFirst.mockResolvedValue({ id: 'f1', uploaded_by: 'planner' });
      await expect(service.deleteFile('e1', 'f1', 'v1')).rejects.toThrow(ForbiddenException);
      await service.deleteFile('e1', 'f1', 'planner');
      expect(prisma.eventFile.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
    });
  });

  describe('budget', () => {
    it('is private to the planner unless shared with the client', async () => {
      await expect(service.budgetSummary('e1', 'v1')).rejects.toThrow(/private/);
      prisma.user.findUnique.mockResolvedValue({ email: 'ada@example.com' });
      await expect(service.budgetSummary('e1', 'ada')).rejects.toThrow(/private/);
      prisma.event.findUnique.mockResolvedValue(event({ client_sees_budget: true }));
      await expect(service.budgetSummary('e1', 'ada')).resolves.toMatchObject({ data: { can_edit: false, total_budget: 20000 } });
    });

    it('creates one budget line per accepted event booking', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: 'b1', amount: 1000, service_fee: 50, vendor: { name: 'Nia Glam' }, listing: { title: 'Bridal Glam', category: { name: 'Beauty' } }, event_bookings: [{ event_id: 'e1' }] });
      prisma.budgetItem.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'existing' });
      await service.syncBookingBudget('b1');
      await service.syncBookingBudget('b1');
      expect(prisma.budgetItem.create).toHaveBeenCalledTimes(1);
      expect(prisma.budgetItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ event_id: 'e1', booking_id: 'b1', category: 'Beauty', allocated: 1050 }) });
    });
  });

  describe('client', () => {
    it('emails the client when added, and not again for the same email', async () => {
      prisma.event.findUnique.mockResolvedValue(event({ client_email: null }));
      prisma.event.update.mockResolvedValue({});
      prisma.user.findUnique.mockResolvedValue({ name: 'Amara' });
      await service.setClient('e1', 'planner', { email: ' Ada@Example.com ' });
      expect(prisma.event.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ client_email: 'ada@example.com' }) }));
      expect(mail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ to: 'ada@example.com', ctaUrl: 'https://app.test/my-events/e1' }));
      mail.sendBookingNotification.mockClear();
      prisma.event.findUnique.mockResolvedValue(event({ client_email: 'ada@example.com' }));
      await service.setClient('e1', 'planner', { email: 'ada@example.com', sees_budget: true });
      expect(mail.sendBookingNotification).not.toHaveBeenCalled();
      expect(prisma.bookingContract.findMany).toHaveBeenCalledTimes(1); // only when the client changed
    });

    it("can't change the client of a cancelled event", async () => {
      prisma.event.findUnique.mockResolvedValue(event({ client_email: null, status: 'CANCELLED' }));
      await expect(service.setClient('e1', 'planner', { email: 'ada@example.com' })).rejects.toThrow("This event was cancelled, so it can't be changed.");
      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(mail.sendBookingNotification).not.toHaveBeenCalled();
    });

    const waiting = [{ id: 'c1', booking_id: 'b1', booking: { vendor_id: 'v1', listing: { title: 'DJ' } } }];

    it('a new client email takes over contracts waiting for the co-signature, and the invite says so', async () => {
      prisma.event.findUnique.mockResolvedValue(event({ client_email: 'old@example.com' }));
      prisma.event.update.mockResolvedValue({});
      prisma.user.findUnique.mockResolvedValue({ name: 'Amara' });
      prisma.bookingContract.findMany.mockResolvedValueOnce(waiting);
      await service.setClient('e1', 'planner', { email: 'New@Example.com' });
      expect(prisma.bookingContract.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['c1'] }, status: 'AWAITING_CLIENT' },
        data: { client_email: 'new@example.com', last_reminder_at: null },
      });
      expect(mail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ to: 'new@example.com', message: expect.stringContaining('co-sign a vendor contract') }));
    });

    it('removing the client sends waiting contracts straight to the vendor', async () => {
      prisma.event.findUnique.mockResolvedValue(event({ client_email: 'ada@example.com' }));
      prisma.event.update.mockResolvedValue({});
      prisma.bookingContract.findMany.mockResolvedValueOnce(waiting);
      await service.setClient('e1', 'planner', { email: null });
      expect(prisma.bookingContract.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['c1'] }, status: 'AWAITING_CLIENT' },
        data: { status: 'AWAITING_VENDOR', client_email: null, last_reminder_at: null },
      });
      expect(push.sendToUser).toHaveBeenCalledWith('v1', expect.objectContaining({ title: 'Ready to accept: DJ' }));
      expect(mail.sendBookingNotification).not.toHaveBeenCalled();
      // the vendor's 72 hours start now, not from when the request was made
      expect(prisma.booking.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['b1'] }, status: 'PENDING' },
        data: { request_opened_at: expect.any(Date), expiry_reminded_at: null },
      });
    });

    it('a new client email leaves the requests’ clock alone (still waiting for a co-signature)', async () => {
      prisma.event.findUnique.mockResolvedValue(event({ client_email: 'old@example.com' }));
      prisma.event.update.mockResolvedValue({});
      prisma.user.findUnique.mockResolvedValue({ name: 'Amara' });
      prisma.bookingContract.findMany.mockResolvedValueOnce(waiting);
      await service.setClient('e1', 'planner', { email: 'new@example.com' });
      expect(prisma.booking.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('teams', () => {
    it('messages every vendor in the team about the event', async () => {
      prisma.vendorTeam.findFirst.mockResolvedValue({ id: 't1', vendor_ids: ['v1', 'v2'] });
      prisma.user.findUnique.mockResolvedValue({ name: 'Amara' });
      prisma.user.findMany.mockResolvedValueOnce([{ id: 'v1' }, { id: 'v2' }]);
      prisma.conversation.findFirst.mockResolvedValueOnce({ id: 'c1' }).mockResolvedValueOnce(null);
      prisma.conversation.create.mockResolvedValue({ id: 'c2' });
      prisma.message.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'm', createdAt: new Date(), ...data, sender: { id: 'planner', name: 'Amara' } }));
      const res = await service.inviteTeam('e1', 'planner', 't1', 'Bridal party of 6.');
      expect(res.data.invited).toBe(2);
      expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
      expect(prisma.message.create.mock.calls[0][0].data.text).toMatch(/Ada & Tobi Wedding.*Bridal party of 6\. Can you send me a quote here\?/);
    });

    it('skips vendors either side has blocked', async () => {
      prisma.vendorTeam.findFirst.mockResolvedValue({ id: 't1', vendor_ids: ['v1', 'v2', 'v3'] });
      prisma.user.findUnique.mockResolvedValue({ name: 'Amara' });
      prisma.user.findMany.mockResolvedValueOnce([{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }]);
      prisma.userBlock.findMany.mockResolvedValueOnce([{ blocker_id: 'planner', blocked_id: 'v1' }, { blocker_id: 'v2', blocked_id: 'planner' }]);
      prisma.conversation.findFirst.mockResolvedValue({ id: 'c3' });
      prisma.message.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'm', createdAt: new Date(), ...data, sender: { id: 'planner', name: 'Amara' } }));
      const res = await service.inviteTeam('e1', 'planner', 't1');
      expect(res.data.invited).toBe(1);
      expect(prisma.message.create).toHaveBeenCalledTimes(1);
      expect(push.sendToUser).toHaveBeenCalledWith('v3', expect.anything(), 'messages');
    });

    it('sends one invite until the vendor replies, so inviting again can’t be used to keep messaging them', async () => {
      prisma.vendorTeam.findFirst.mockResolvedValue({ id: 't1', vendor_ids: ['v1'] });
      prisma.user.findUnique.mockResolvedValue({ name: 'Amara' });
      prisma.user.findMany
        .mockResolvedValueOnce([{ id: 'v1' }])
        .mockResolvedValueOnce([
          { id: 'planner', name: 'Amara', type: 'EVENT_PLANNER', roles: ['EVENT_PLANNER'] },
          { id: 'v1', name: 'Bloom Florals', type: 'VENDOR', roles: ['VENDOR'] },
        ]);
      prisma.conversation.findFirst.mockResolvedValue({ id: 'c1', vendor_replied_at: null });
      prisma.booking.count = jest.fn().mockResolvedValue(0);
      // the vendor hasn't replied; one invite is already there
      prisma.message.count.mockImplementation(async ({ where }: any) => (where.kind === 'invite' ? 1 : 0));
      const res = await service.inviteTeam('e1', 'planner', 't1', 'Hello again');
      expect(res.data.invited).toBe(0);
      expect(prisma.message.create).not.toHaveBeenCalled();
      prisma.message.count.mockResolvedValue(0);
    });
  });

  it('skips team members who were suspended or deleted since the team was saved', async () => {
    prisma.vendorTeam.findFirst.mockResolvedValue({ id: 't1', vendor_ids: ['v1', 'gone'] });
    prisma.user.findUnique.mockResolvedValue({ name: 'Amara' });
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'v1' }]);
    prisma.conversation.findFirst.mockResolvedValue({ id: 'c1' });
    prisma.message.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'm', createdAt: new Date(), ...data, sender: { id: 'planner', name: 'Amara' } }));
    const res = await service.inviteTeam('e1', 'planner', 't1');
    expect(res.data.invited).toBe(1);
    expect(push.sendToUser).not.toHaveBeenCalledWith('gone', expect.anything(), expect.anything());
  });

  describe('saving a team (any active vendor, booked or not)', () => {
    const vendorRow = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `User ${id}`, avatar: null, vendorProfile: { business_name: `Shop ${id}` }, vendorListings: [{ category: { name: 'Catering' } }], ...over });

    it('saves vendors the planner has never booked', async () => {
      prisma.user.findMany.mockResolvedValueOnce([{ id: 'v7' }, { id: 'v8' }]);
      prisma.vendorTeam.create.mockResolvedValue({ id: 't1' });
      await service.saveTeam('planner', { name: '  Dream team ', vendor_ids: ['v7', 'v8', 'v7'] });
      expect(prisma.vendorTeam.create).toHaveBeenCalledWith({ data: { planner_id: 'planner', name: 'Dream team', vendor_ids: ['v7', 'v8'] } });
      // only active vendor accounts count: not deleted, not suspended, holding the vendor role
      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ id: { in: ['v7', 'v8'] }, deleted_at: null });
      expect(JSON.stringify(where.AND)).toContain('"status":{"not":0}');
      expect(JSON.stringify(where.AND)).toContain('"roles":{"has":"VENDOR"}');
    });

    it('refuses accounts that are not active vendors', async () => {
      prisma.user.findMany.mockResolvedValueOnce([{ id: 'v7' }]);
      await expect(service.saveTeam('planner', { name: 'Team', vendor_ids: ['v7', 'customer'] })).rejects.toThrow('Some of those accounts are not active vendors.');
      expect(prisma.vendorTeam.create).not.toHaveBeenCalled();
    });

    it('refuses vendors either side has blocked', async () => {
      prisma.user.findMany.mockResolvedValueOnce([{ id: 'v7' }]).mockResolvedValueOnce([{ id: 'v7' }]);
      prisma.userBlock.findMany.mockResolvedValueOnce([{ blocker_id: 'v7', blocked_id: 'planner' }]);
      await expect(service.saveTeam('planner', { name: 'Team', vendor_ids: ['v7'] })).rejects.toThrow("You can't add someone you've blocked or who has blocked you.");
      prisma.userBlock.findMany.mockResolvedValueOnce([{ blocker_id: 'planner', blocked_id: 'v7' }]);
      await expect(service.saveTeam('planner', { name: 'Team', vendor_ids: ['v7'] }, 't1')).rejects.toThrow(BadRequestException);
      expect(prisma.vendorTeam.create).not.toHaveBeenCalled();
      expect(prisma.vendorTeam.updateMany).not.toHaveBeenCalled();
    });

    it('caps the size, needs a name and leaves the planner out', async () => {
      const many = Array.from({ length: 51 }, (_, i) => `v${i}`);
      await expect(service.saveTeam('planner', { name: 'Big', vendor_ids: many })).rejects.toThrow('A team can have up to 50 vendors.');
      await expect(service.saveTeam('planner', { name: '  ', vendor_ids: ['v1'] })).rejects.toThrow('Give the team a name.');
      await expect(service.saveTeam('planner', { name: 'Me', vendor_ids: ['planner'] })).rejects.toThrow("You can't add yourself to your own team.");
    });

    it("only edits the planner's own team", async () => {
      prisma.user.findMany.mockResolvedValueOnce([{ id: 'v7' }]);
      prisma.vendorTeam.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.saveTeam('planner', { name: 'Team', vendor_ids: ['v7'] }, 'someone-elses')).rejects.toThrow('Team not found');
      expect(prisma.vendorTeam.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'someone-elses', planner_id: 'planner' } }));
    });

    it('lists teams with only the vendors still available, with name and category', async () => {
      prisma.vendorTeam.findMany.mockResolvedValue([{ id: 't1', name: 'Team', vendor_ids: ['v1', 'gone', 'v2'] }]);
      prisma.user.findMany.mockResolvedValueOnce([vendorRow('v1', { avatar: 'a.jpg' }), vendorRow('v2')]);
      prisma.userBlock.findMany.mockResolvedValueOnce([{ blocker_id: 'v2', blocked_id: 'planner' }]);
      const res = await service.teams('planner');
      expect(res.data[0].vendors).toEqual([{ id: 'v1', name: 'Shop v1', avatar_url: 'https://cdn.test/a/a.jpg', category: 'Catering' }]);
    });

    it('searches active vendors by name or category, leaving out the planner and blocked people', async () => {
      prisma.userBlock.findMany.mockResolvedValueOnce([{ blocker_id: 'planner', blocked_id: 'v9' }]);
      prisma.user.findMany.mockResolvedValueOnce([vendorRow('v1', { vendorProfile: null, vendorListings: [] })]);
      const res = await service.searchTeamVendors('planner', '  cater ');
      expect(res.data).toEqual([{ id: 'v1', name: 'User v1', avatar_url: null, category: null }]);
      const args = prisma.user.findMany.mock.calls[0][0];
      expect(args.where.id).toEqual({ notIn: ['planner', 'v9'] });
      expect(JSON.stringify(args.where.AND)).toContain('"contains":"cater"');
      expect(args.take).toBe(20);
    });

    it('needs at least two letters to search', async () => {
      await expect(service.searchTeamVendors('planner', 'a')).resolves.toEqual({ success: true, data: [] });
      await expect(service.searchTeamVendors('planner', undefined)).resolves.toEqual({ success: true, data: [] });
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });
});
