import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ChatSafetyService } from './safety.service';
import { AdminChatReportsController, ChatSafetyController } from './safety.controller';
import { ReportUserDto, ResolveReportDto } from './safety.dto';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { Role } from 'src/common/guard/role/role.enum';

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({ TanvirStorage: { url: (p: string) => `https://cdn.test/${p}` } }));
jest.mock('src/config/app.config', () => ({ __esModule: true, default: () => ({ storageUrl: { avatar: 'avatar', attachment: 'attachment' } }) }));

const prisma: any = {
  user: { findFirst: jest.fn(), findMany: jest.fn() },
  userBlock: { upsert: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
  userReport: { create: jest.fn(), count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  message: { findUnique: jest.fn(), findMany: jest.fn() },
  participant: { findFirst: jest.fn() },
};

const msg = (id: string, at: string, senderId = 'bad') => ({
  id,
  conversationId: 'c1',
  text: `text ${id}`,
  createdAt: new Date(at),
  attachments: [],
  senderId,
  sender: { id: senderId, name: senderId, email: null, avatar: null },
  quote: null,
});

describe('ChatSafetyService', () => {
  let service: ChatSafetyService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findFirst.mockResolvedValue({ id: 'bad' });
    prisma.userReport.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'r1', status: 'OPEN', ...data }));
    service = new ChatSafetyService(prisma);
  });

  describe('block', () => {
    it("can't block yourself", async () => {
      await expect(service.block('me', 'me')).rejects.toThrow(BadRequestException);
      expect(prisma.userBlock.upsert).not.toHaveBeenCalled();
    });

    it('blocks once, even if asked twice', async () => {
      await service.block('me', 'bad');
      expect(prisma.userBlock.upsert).toHaveBeenCalledWith({
        where: { blocker_id_blocked_id: { blocker_id: 'me', blocked_id: 'bad' } },
        create: { blocker_id: 'me', blocked_id: 'bad' },
        update: {},
      });
    });

    it('refuses unknown users', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.block('me', 'ghost')).rejects.toThrow(NotFoundException);
    });

    it('unblocks only my own block', async () => {
      const res = await service.unblock('me', 'bad');
      expect(prisma.userBlock.deleteMany).toHaveBeenCalledWith({ where: { blocker_id: 'me', blocked_id: 'bad' } });
      expect(res.data).toEqual({ user_id: 'bad', blocked: false });
    });

    it('lists the people I blocked with name and avatar', async () => {
      prisma.userBlock.findMany.mockResolvedValue([{ created_at: new Date('2026-10-01'), blocked: { id: 'bad', name: 'Bad Actor', avatar: 'b.jpg' } }]);
      const res = await service.listBlocks('me');
      expect(prisma.userBlock.findMany.mock.calls[0][0].where).toEqual({ blocker_id: 'me' });
      expect(res.data).toEqual([{ id: 'bad', name: 'Bad Actor', avatar_url: 'https://cdn.test/avatar/b.jpg', blocked_at: new Date('2026-10-01') }]);
    });
  });

  describe('report', () => {
    const base = { reported_id: 'bad', reason: 'harassment' as const };

    it("can't report yourself", async () => {
      await expect(service.report('me', { ...base, reported_id: 'me' })).rejects.toThrow(BadRequestException);
    });

    it('needs the reporter to be in the conversation', async () => {
      prisma.participant.findFirst.mockResolvedValue(null);
      await expect(service.report('me', { ...base, conversation_id: 'c1' })).rejects.toThrow(ForbiddenException);
      expect(prisma.userReport.create).not.toHaveBeenCalled();
    });

    it('takes the conversation from the reported message', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'm1', conversationId: 'c1', senderId: 'bad', text: 'pay me on Zelle', attachments: ['x.jpg', 'y.pdf'] });
      prisma.participant.findFirst.mockResolvedValue({ id: 'p' });
      await service.report('me', { ...base, message_id: 'm1', details: '  rude  ' });
      expect(prisma.participant.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { conversationId: 'c1', userId: 'me' } }));
      // a copy of the message is kept with the report
      expect(prisma.userReport.create).toHaveBeenCalledWith({
        data: {
          reporter_id: 'me', reported_id: 'bad', conversation_id: 'c1', message_id: 'm1', reason: 'harassment', details: 'rude',
          message_text: 'pay me on Zelle', message_attachments: ['x.jpg', 'y.pdf'],
        },
      });
    });

    it('keeps no copy when only the conversation is reported', async () => {
      prisma.participant.findFirst.mockResolvedValue({ id: 'p' });
      await service.report('me', { ...base, conversation_id: 'c1' });
      expect(prisma.userReport.create.mock.calls[0][0].data).toMatchObject({ message_id: null, message_text: null, message_attachments: [] });
    });

    it('refuses a message from another conversation or another sender', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'm1', conversationId: 'c2', senderId: 'bad' });
      await expect(service.report('me', { ...base, conversation_id: 'c1', message_id: 'm1' })).rejects.toThrow(BadRequestException);
      prisma.message.findUnique.mockResolvedValue({ id: 'm1', conversationId: 'c1', senderId: 'someone-else' });
      await expect(service.report('me', { ...base, message_id: 'm1' })).rejects.toThrow(BadRequestException);
      expect(prisma.userReport.create).not.toHaveBeenCalled();
    });

    it('can also block', async () => {
      prisma.participant.findFirst.mockResolvedValue({ id: 'p' });
      const res = await service.report('me', { ...base, conversation_id: 'c1', block: true });
      expect(res.data).toEqual({ id: 'r1', status: 'OPEN', blocked: true });
      expect(prisma.userBlock.upsert).toHaveBeenCalled();
    });

    it('validates the body', async () => {
      const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
      const check = (body: unknown) => pipe.transform(body, { type: 'body', metatype: ReportUserDto });
      await expect(check({ reported_id: 'bad', reason: 'boring' })).rejects.toThrow(BadRequestException);
      await expect(check({ reason: 'spam' })).rejects.toThrow(BadRequestException);
      await expect(check({ reported_id: 'bad', reason: 'spam', details: 'x'.repeat(2001) })).rejects.toThrow(BadRequestException);
      await expect(check({ reported_id: 'bad', reason: 'spam', extra: 1 })).rejects.toThrow(BadRequestException);
      await expect(check({ reported_id: 'bad', reason: 'scam', details: 'asked for Zelle', conversation_id: 'c1', message_id: 'm1', block: true })).resolves.toBeInstanceOf(ReportUserDto);
    });
  });

  describe('admin', () => {
    const report = {
      id: 'r1',
      created_at: new Date('2026-10-20'),
      reason: 'scam',
      details: null,
      status: 'OPEN',
      resolved_at: null,
      resolved_by: null,
      resolution_note: null,
      reporter_id: 'me',
      reported_id: 'bad',
      conversation_id: 'c1',
      message_id: 'm2',
      reporter: { id: 'me', name: 'Me', email: 'me@x.com', avatar: null, status: 1, type: 'CUSTOMER' },
      reported: { id: 'bad', name: 'Bad', email: 'bad@x.com', avatar: null, status: 1, type: 'VENDOR' },
    };

    it('lists open reports with the message and the conversation leading up to it', async () => {
      prisma.userReport.count.mockResolvedValue(1);
      prisma.userReport.findMany.mockResolvedValue([report]);
      prisma.message.findUnique.mockResolvedValue(msg('m2', '2026-10-20T10:01:00Z'));
      prisma.message.findMany.mockResolvedValue([msg('m2', '2026-10-20T10:01:00Z'), msg('m1', '2026-10-20T10:00:00Z', 'me')]);

      const res = await service.adminList({ status: 'open' });

      expect(prisma.userReport.findMany.mock.calls[0][0].where).toEqual({ status: 'OPEN' });
      expect(prisma.message.findMany.mock.calls[0][0]).toMatchObject({
        where: { conversationId: 'c1', createdAt: { lte: new Date('2026-10-20T10:01:00Z') } },
        take: 10,
      });
      const row = res.data[0];
      expect(row.message?.text).toBe('text m2');
      expect(row.context.map((m) => m.id)).toEqual(['m1', 'm2']); // oldest first
      expect(row.reported).toMatchObject({ id: 'bad', email: 'bad@x.com', status: 1 });
      expect(res.meta).toEqual({ page: 1, limit: 20, total: 1 });
      expect(row.message_deleted).toBe(false);
    });

    it('shows the kept copy when the sender deleted the message', async () => {
      prisma.userReport.count.mockResolvedValue(1);
      prisma.userReport.findMany.mockResolvedValue([{ ...report, message_text: 'send the deposit to my cashapp', message_attachments: ['proof.jpg'] }]);
      prisma.message.findUnique.mockResolvedValue(null);
      prisma.message.findMany.mockResolvedValue([]);

      const row = (await service.adminList({ status: 'open' })).data[0];

      expect(row.message).toBeNull();
      expect(row.message_deleted).toBe(true);
      expect(row.message_copy).toEqual({
        text: 'send the deposit to my cashapp',
        attachments: ['proof.jpg'],
        attachments_url: ['https://cdn.test/attachment/proof.jpg'],
      });
    });

    it('lists resolved reports under done', async () => {
      prisma.userReport.count.mockResolvedValue(0);
      prisma.userReport.findMany.mockResolvedValue([]);
      await service.adminList({ status: 'done' });
      expect(prisma.userReport.findMany.mock.calls[0][0].where).toEqual({ status: { in: ['ACTIONED', 'DISMISSED'] } });
    });

    it('resolves an open report with a note', async () => {
      prisma.userReport.findUnique.mockResolvedValue({ id: 'r1', status: 'OPEN' });
      prisma.userReport.updateMany.mockResolvedValue({ count: 1 });
      const res = await service.resolve('admin', 'r1', { action: 'actioned', note: ' Suspended the account ' });
      expect(prisma.userReport.updateMany).toHaveBeenCalledWith({
        where: { id: 'r1', status: 'OPEN' },
        data: expect.objectContaining({ status: 'ACTIONED', resolved_by: 'admin', resolution_note: 'Suspended the account', resolved_at: expect.any(Date) }),
      });
      expect(res.data.status).toBe('ACTIONED');
    });

    it('dismisses', async () => {
      prisma.userReport.findUnique.mockResolvedValue({ id: 'r1', status: 'OPEN' });
      prisma.userReport.updateMany.mockResolvedValue({ count: 1 });
      await service.resolve('admin', 'r1', { action: 'dismiss' });
      expect(prisma.userReport.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'DISMISSED', resolution_note: null });
    });

    it("won't resolve twice or a missing report", async () => {
      prisma.userReport.findUnique.mockResolvedValue({ id: 'r1', status: 'DISMISSED' });
      prisma.userReport.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.resolve('admin', 'r1', { action: 'actioned' })).rejects.toThrow(BadRequestException);
      prisma.userReport.findUnique.mockResolvedValue(null);
      await expect(service.resolve('admin', 'nope', { action: 'actioned' })).rejects.toThrow(NotFoundException);
    });

    it('validates the resolve body', async () => {
      const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
      await expect(pipe.transform({ action: 'ban' }, { type: 'body', metatype: ResolveReportDto })).rejects.toThrow(BadRequestException);
      await expect(pipe.transform({ action: 'dismiss', note: 'dup' }, { type: 'body', metatype: ResolveReportDto })).resolves.toBeInstanceOf(ResolveReportDto);
    });
  });

  describe('guards', () => {
    it('admin routes need an admin', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, AdminChatReportsController)).toEqual([JwtAuthGuard, RolesGuard]);
      expect(Reflect.getMetadata('roles', AdminChatReportsController)).toEqual([Role.ADMIN]);
    });

    it('chat routes need a signed-in user', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, ChatSafetyController)).toEqual([JwtAuthGuard]);
    });
  });
});
