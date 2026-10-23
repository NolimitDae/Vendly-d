import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MessageService } from './message.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { MessageGateway } from './message.gateway';

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({
  TanvirStorage: {
    url: jest.fn((path: string) => `https://cdn.example.com/${path}`),
    put: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('src/config/app.config', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    storageUrl: { avatar: 'avatars', attachment: 'attachments' },
  })),
}));

jest.mock('src/common/helper/string.helper', () => ({
  StringHelper: {
    randomString: jest.fn(() => 'rndstr01'),
  },
}));

const makeSender = () => ({
  id: 'user-1',
  name: 'Alice',
  email: 'alice@test.com',
  avatar: null,
});

const makeMessage = (overrides = {}) => ({
  id: 'msg-1',
  text: 'Hello',
  createdAt: new Date(),
  updatedAt: new Date(),
  status: 'SENT',
  attachments: [],
  senderId: 'user-1',
  conversationId: 'conv-1',
  sender: makeSender(),
  ...overrides,
});

const mockPrisma = {
  userBlock: { findMany: jest.fn().mockResolvedValue([]) },
  participant: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  conversation: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  message: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  userReport: { findMany: jest.fn().mockResolvedValue([]) },
  $transaction: jest.fn(),
};

const mockServer = {
  to: jest.fn().mockReturnThis(),
  except: jest.fn().mockReturnThis(),
  emit: jest.fn(),
};

const mockMessageGateway = {
  clients: new Map<string, string>(),
  server: mockServer,
};

describe('MessageService', () => {
  let service: MessageService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MessageGateway, useValue: mockMessageGateway },
      ],
    }).compile();

    service = module.get<MessageService>(MessageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto = { text: 'Hello', conversationId: 'conv-1' };
    const conversation = {
      id: 'conv-1',
      participants: [{ userId: 'user-1' }, { userId: 'user-2' }],
    };

    it('should create a message and emit socket event', async () => {
      mockPrisma.participant.findFirst.mockResolvedValue({ userId: 'user-1' });
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);
      mockPrisma.message.create.mockResolvedValue(makeMessage());
      mockPrisma.conversation.update.mockResolvedValue({});

      const result = await service.create(dto, 'user-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Message sent successfully');
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ text: 'Hello', senderId: 'user-1' }),
        }),
      );
    });

    it('should throw ForbiddenException (403, not a sign-in problem) when sender is not a participant', async () => {
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      await expect(service.create(dto, 'outsider')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException when conversation does not exist', async () => {
      mockPrisma.participant.findFirst.mockResolvedValue({ userId: 'user-1' });
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(NotFoundException);
    });

    describe('blocking (1:1)', () => {
      beforeEach(() => {
        mockPrisma.participant.findFirst.mockResolvedValue({ userId: 'user-1' });
        mockPrisma.conversation.findUnique.mockResolvedValue(conversation);
        mockPrisma.message.create.mockResolvedValue(makeMessage());
      });

      it('refuses when I blocked the other person, and says how to fix it', async () => {
        mockPrisma.userBlock.findMany.mockResolvedValueOnce([{ blocker_id: 'user-1', blocked_id: 'user-2' }]);
        const err = await service.create(dto, 'user-1').catch((e) => e);
        expect(err).toBeInstanceOf(ForbiddenException);
        expect(err.message).toBe('You blocked this person. Unblock them to send a message.');
        expect(mockPrisma.message.create).not.toHaveBeenCalled();
      });

      it('refuses when the other person blocked me', async () => {
        mockPrisma.userBlock.findMany.mockResolvedValueOnce([{ blocker_id: 'user-2', blocked_id: 'user-1' }]);
        const err = await service.create(dto, 'user-1').catch((e) => e);
        expect(err).toBeInstanceOf(ForbiddenException);
        expect(err.message).toBe("You can't message this person.");
        expect(mockPrisma.message.create).not.toHaveBeenCalled();
      });

      it('checks both directions between the two people', async () => {
        await service.create(dto, 'user-1');
        expect(mockPrisma.userBlock.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { OR: [{ blocker_id: 'user-1', blocked_id: 'user-2' }, { blocker_id: 'user-2', blocked_id: 'user-1' }] },
          }),
        );
      });

      it('does not filter group chats', async () => {
        mockPrisma.conversation.findUnique.mockResolvedValue({ ...conversation, is_group: true });
        const result = await service.create(dto, 'user-1');
        expect(result.success).toBe(true);
        expect(mockPrisma.userBlock.findMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('findAll', () => {
    const paginationDto = { page: 1, perPage: 10 };
    const conversation = {
      id: 'conv-1',
      participants: [
        { userId: 'user-1', user: { id: 'user-1', name: 'Alice', email: 'alice@test.com', avatar: null } },
        { userId: 'user-2', user: { id: 'user-2', name: 'Bob', email: 'bob@test.com', avatar: null } },
      ],
    };

    it('should return paginated messages for a conversation', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);
      mockPrisma.$transaction.mockResolvedValue([1, [makeMessage()]]);

      const result = await service.findAll('conv-1', 'user-1', paginationDto);

      expect(result.success).toBe(true);
      expect(mockPrisma.conversation.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'conv-1' } }),
      );
    });

    it('tells a 1:1 chat who has blocked whom', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);
      mockPrisma.$transaction.mockResolvedValue([1, [makeMessage()]]);
      mockPrisma.userBlock.findMany.mockResolvedValueOnce([{ blocker_id: 'user-2', blocked_id: 'user-1' }]);

      const result = await service.findAll('conv-1', 'user-1', paginationDto);

      expect(result.conversation).toMatchObject({ blocked_by_me: false, blocked_me: true });
    });

    it('leaves the block flags off group chats', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({ ...conversation, is_group: true });
      mockPrisma.$transaction.mockResolvedValue([1, [makeMessage()]]);

      const result = await service.findAll('conv-1', 'user-1', paginationDto);

      expect(result.conversation).not.toHaveProperty('blocked_by_me');
      expect(mockPrisma.userBlock.findMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when conversation is not found', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      await expect(
        service.findAll('missing', 'user-1', paginationDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException (403, not a sign-in problem) when user is not a participant', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        ...conversation,
        participants: [{ userId: 'user-2', user: { id: 'user-2', name: 'Bob', email: 'bob@test.com', avatar: null } }],
      });

      await expect(
        service.findAll('conv-1', 'outsider', paginationDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return empty message response when conversation has no messages', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);
      mockPrisma.$transaction.mockResolvedValue([0, []]);

      const result = await service.findAll('conv-1', 'user-1', paginationDto);

      expect(result.success).toBe(true);
      expect(result.message).toBe('No messages found');
    });
  });

  describe('deleteMessage', () => {
    it('should delete a message owned by the user', async () => {
      const msg = makeMessage();
      mockPrisma.message.findUnique.mockResolvedValue(msg);
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));

      const result = await service.deleteMessage('user-1', 'msg-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Message deleted successfully');
    });

    it('deletes the files but keeps the ones a report kept as evidence', async () => {
      const { TanvirStorage } = jest.requireMock('src/common/lib/Disk/TanvirStorage');
      TanvirStorage.delete.mockClear();
      mockPrisma.message.findUnique.mockResolvedValue(makeMessage({ attachments: ['a.jpg', 'b.jpg'] }));
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.userReport.findMany.mockResolvedValueOnce([{ message_attachments: ['a.jpg'] }]);

      await service.deleteMessage('user-1', 'msg-1');

      expect(mockPrisma.userReport.findMany.mock.calls.at(-1)[0].where).toEqual({ message_attachments: { hasSome: ['a.jpg', 'b.jpg'] } });
      expect(TanvirStorage.delete).toHaveBeenCalledTimes(1);
      expect(TanvirStorage.delete).toHaveBeenCalledWith('attachments/b.jpg');
    });

    it('should throw NotFoundException when message does not exist', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      await expect(service.deleteMessage('user-1', 'bad-msg')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException (403, not a sign-in problem) when user is not the message sender', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(makeMessage({ senderId: 'other-user' }));

      await expect(service.deleteMessage('user-1', 'msg-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getUnreadMessage', () => {
    it('should return unread message count and messages', async () => {
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'part-1',
        userId: 'user-1',
        lastReadAt: new Date(0),
      });
      mockPrisma.$transaction.mockResolvedValue([
        2,
        [makeMessage({ senderId: 'user-2' })],
      ]);

      const result = await service.getUnreadMessage('user-1', 'conv-1');

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(2);
    });

    it('should throw ForbiddenException (403, not a sign-in problem) when user is not a participant', async () => {
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      await expect(
        service.getUnreadMessage('outsider', 'conv-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('readMessages', () => {
    it('should mark messages as read and return success', async () => {
      const participant = { id: 'part-1', userId: 'user-1', lastReadAt: new Date(0) };
      mockPrisma.participant.findFirst.mockResolvedValue(participant);
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));

      const result = await service.readMessages('user-1', 'conv-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Messages marked as read successfully');
    });

    it("marks only the other side's messages since the last read, up to now", async () => {
      const lastReadAt = new Date('2026-10-01T10:00:00Z');
      mockPrisma.participant.findFirst.mockResolvedValue({ id: 'part-1', userId: 'user-1', lastReadAt });
      mockPrisma.participant.findMany.mockResolvedValue([{ userId: 'user-1' }, { userId: 'user-2' }]);
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));

      const result = await service.readMessages('user-1', 'conv-1');

      const readAt = result.data.read_at;
      expect(mockPrisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          conversationId: 'conv-1',
          senderId: { not: 'user-1' },
          status: { not: 'READ' },
          createdAt: { gt: lastReadAt, lte: readAt },
        },
        data: { status: 'READ' },
      });
      expect(mockPrisma.participant.update).toHaveBeenCalledWith({ where: { id: 'part-1' }, data: { lastReadAt: readAt } });
    });

    it('tells the conversation and every participant (so the sender sees "Seen")', async () => {
      mockPrisma.participant.findFirst.mockResolvedValue({ id: 'part-2', userId: 'user-2', lastReadAt: null });
      mockPrisma.participant.findMany.mockResolvedValue([{ userId: 'user-1' }, { userId: 'user-2' }]);
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));

      const result = await service.readMessages('user-2', 'conv-1');

      expect(mockServer.to).toHaveBeenCalledWith(['conv-1', 'user_user-1', 'user_user-2']);
      expect(mockServer.emit).toHaveBeenCalledWith('conversationRead', {
        conversation_id: 'conv-1',
        user_id: 'user-2',
        read_at: result.data.read_at,
      });
    });

    it('should throw ForbiddenException (403, not a sign-in problem) when user is not a participant', async () => {
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      await expect(service.readMessages('outsider', 'conv-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.message.updateMany).not.toHaveBeenCalled();
      expect(mockServer.emit).not.toHaveBeenCalled();
    });
  });
});
