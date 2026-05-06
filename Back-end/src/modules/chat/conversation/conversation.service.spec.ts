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
      expect(result.conversation.id).toBe('conv-1');
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
    it('should return all users except the requesting user', async () => {
      const users = [
        { id: 'user-2', name: 'User 2', email: 'u2@test.com', avatar: null, type: 'CUSTOMER' },
        { id: 'user-3', name: 'User 3', email: 'u3@test.com', avatar: null, type: 'VENDOR' },
      ];
      mockPrisma.user.findMany.mockResolvedValue(users);

      const result = await service.findAllUserInfo('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { not: 'user-1' } } }),
      );
    });

    it('should return an empty data array when no other users exist', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.findAllUserInfo('only-user');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });
});
