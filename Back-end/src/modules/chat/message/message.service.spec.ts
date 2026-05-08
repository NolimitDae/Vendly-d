import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
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

jest.mock('src/config/app.config', () =>
  jest.fn(() => ({
    storageUrl: { avatar: 'avatars', attachment: 'attachments' },
  })),
);

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
  participant: { findFirst: jest.fn(), update: jest.fn() },
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

    it('should throw UnauthorizedException when sender is not a participant', async () => {
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      await expect(service.create(dto, 'outsider')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw NotFoundException when conversation does not exist', async () => {
      mockPrisma.participant.findFirst.mockResolvedValue({ userId: 'user-1' });
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(NotFoundException);
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

    it('should throw NotFoundException when conversation is not found', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      await expect(
        service.findAll('missing', 'user-1', paginationDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw UnauthorizedException when user is not a participant', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        ...conversation,
        participants: [{ userId: 'user-2', user: { id: 'user-2', name: 'Bob', email: 'bob@test.com', avatar: null } }],
      });

      await expect(
        service.findAll('conv-1', 'outsider', paginationDto),
      ).rejects.toThrow(UnauthorizedException);
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

    it('should throw NotFoundException when message does not exist', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      await expect(service.deleteMessage('user-1', 'bad-msg')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw UnauthorizedException when user is not the message sender', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(makeMessage({ senderId: 'other-user' }));

      await expect(service.deleteMessage('user-1', 'msg-1')).rejects.toThrow(
        UnauthorizedException,
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

    it('should throw UnauthorizedException when user is not a participant', async () => {
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      await expect(
        service.getUnreadMessage('outsider', 'conv-1'),
      ).rejects.toThrow(UnauthorizedException);
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

    it('should throw UnauthorizedException when user is not a participant', async () => {
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      await expect(service.readMessages('outsider', 'conv-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
