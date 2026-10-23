import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { MessageGateway } from '../message/message.gateway';

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({
  TanvirStorage: {
    url: jest.fn((path: string) => `https://cdn.example.com/${path}`),
  },
}));

jest.mock('src/config/app.config', () =>
  jest.fn(() => ({
    storageUrl: { avatar: 'avatars', attachment: 'attachments' },
  })),
);

const mockPrisma = {
  userBlock: { findMany: jest.fn().mockResolvedValue([]) },
  conversation: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
  booking: {
    findMany: jest.fn(),
  },
  message: {
    count: jest.fn().mockResolvedValue(0),
  },
};

const mockMessageGateway = {
  clients: new Map<string, string>(),
  server: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
};

const mockParticipant = (userId: string) => ({
  userId,
  user: { id: userId, name: `User ${userId}`, avatar: null },
});

describe('ConversationService', () => {
  let service: ConversationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MessageGateway, useValue: mockMessageGateway },
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should throw ConflictException when sender equals participant_id', async () => {
      await expect(
        service.create({ participant_id: 'user-1' }, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should return existing conversation when one already exists', async () => {
      const existing = {
        id: 'conv-1',
        participants: [mockParticipant('user-1'), mockParticipant('user-2')],
      };
      mockPrisma.conversation.findFirst.mockResolvedValue(existing);

      const result = await service.create({ participant_id: 'user-2' }, 'user-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Conversation already exists');
      expect((result.conversation as any).id).toBe('conv-1');
    });

    it('should create a new conversation when none exists', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      const created = {
        id: 'conv-new',
        participants: [mockParticipant('user-1'), mockParticipant('user-2')],
      };
      mockPrisma.conversation.create.mockResolvedValue(created);

      const result = await service.create({ participant_id: 'user-2' }, 'user-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Conversation created successfully');
      expect(mockPrisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.anything() }),
      );
    });
  });

  describe('findAll', () => {
    it('should return a list of conversations for a user', async () => {
      const conversations = [
        {
          id: 'conv-1',
          updatedAt: new Date(),
          participants: [mockParticipant('user-1'), mockParticipant('user-2')],
          messages: [
            { text: 'Hello', createdAt: new Date(), attachments: [] },
          ],
        },
      ];
      mockPrisma.conversation.findMany.mockResolvedValue(conversations);

      const result = await service.findAll('user-1');

      expect(result.success).toBe(true);
      expect(result.conversations).toHaveLength(1);
      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { participants: { some: { userId: 'user-1' } } },
        }),
      );
    });

    it('marks 1:1 chats with who has blocked whom', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        { id: 'conv-1', updatedAt: new Date(), participants: [mockParticipant('user-1'), mockParticipant('user-2')], messages: [] },
        { id: 'conv-2', updatedAt: new Date(), participants: [mockParticipant('user-1'), mockParticipant('user-3')], messages: [] },
      ]);
      mockPrisma.userBlock.findMany.mockResolvedValueOnce([{ blocker_id: 'user-1', blocked_id: 'user-2' }]);

      const result = await service.findAll('user-1');

      expect(result.conversations[0]).toMatchObject({ blocked_by_me: true, blocked_me: false });
      expect(result.conversations[1]).toMatchObject({ blocked_by_me: false, blocked_me: false });
    });

    it('should return empty conversations array when user has none', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);

      const result = await service.findAll('user-no-convs');

      expect(result.success).toBe(true);
      expect(result.conversations).toHaveLength(0);
    });
  });

  describe('findOne', () => {
    it('should return a conversation when found', async () => {
      const conversation = {
        id: 'conv-1',
        participants: [mockParticipant('user-1'), mockParticipant('user-2')],
        messages: [
          {
            id: 'msg-1',
            text: 'Hi',
            createdAt: new Date(),
            attachments: [],
            sender: { id: 'user-2', name: 'User user-2', avatar: null },
          },
        ],
      };
      mockPrisma.conversation.findFirst.mockResolvedValue(conversation);

      const result = await service.findOne('conv-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.conversation.id).toBe('conv-1');
    });

    it('should throw NotFoundException when conversation is not found', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      await expect(service.findOne('missing-id', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a conversation that belongs to the user', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      mockPrisma.conversation.delete.mockResolvedValue({ id: 'conv-1' });

      const result = await service.remove('conv-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Conversation deleted successfully');
      expect(mockPrisma.conversation.delete).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
      });
    });

    it('should throw NotFoundException when conversation is not found or user is not participant', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      await expect(service.remove('bad-id', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAllUserInfo', () => {
    it('returns only the other party of the user bookings, without emails', async () => {
      mockPrisma.booking.findMany.mockResolvedValue([
        { customer_id: 'user-1', vendor_id: 'vendor-a' },
        { customer_id: 'user-1', vendor_id: 'vendor-a' },
        { customer_id: 'cust-b', vendor_id: 'user-1' },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'vendor-a', name: 'Vendor A', avatar: null, type: 'VENDOR' },
        { id: 'cust-b', name: 'Customer B', avatar: null, type: 'CLIENT' },
      ]);

      const result = await service.findAllUserInfo('user-1');

      const where = mockPrisma.user.findMany.mock.calls[0][0].where;
      expect(where.id.in.sort()).toEqual(['cust-b', 'vendor-a']);
      expect(mockPrisma.user.findMany.mock.calls[0][0].select.email).toBeUndefined();
      expect(result.data).toHaveLength(2);
      result.data.forEach((u: Record<string, unknown>) => expect(u).not.toHaveProperty('email'));
    });

    it('returns nobody when the user has no bookings', async () => {
      mockPrisma.booking.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.findAllUserInfo('new-user');

      expect(mockPrisma.user.findMany.mock.calls[0][0].where.id.in).toEqual([]);
      expect(result.data).toHaveLength(0);
    });
  });
});
