import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserRepository } from '../../../common/repository/user/user.repository';

jest.mock('../../../common/lib/Disk/TanvirStorage', () => ({
  TanvirStorage: {
    url: jest.fn((path: string) => `https://cdn.example.com/${path}`),
  },
}));

jest.mock('../../../config/app.config', () => ({
  default: jest.fn(() => ({
    storageUrl: {
      avatar: 'avatars',
    },
  })),
}));

const mockNotification = {
  id: 'notif-1',
  sender_id: 'user-1',
  receiver_id: 'admin-1',
  entity_id: 'entity-1',
  created_at: new Date('2024-01-01'),
  sender: { id: 'user-1', name: 'Alice', email: 'alice@test.com', avatar: null },
  receiver: { id: 'admin-1', name: 'Admin', email: 'admin@test.com', avatar: null },
  notification_event: { id: 'event-1', type: 'BOOKING', text: 'New booking created' },
};

const mockAdminUser = {
  id: 'admin-1',
  type: 'ADMIN',
  email: 'admin@test.com',
};

const mockPrisma = {
  notification: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockUserRepository = {
  getUserDetails: jest.fn(),
};

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UserRepository, useValue: mockUserRepository },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return notifications for admin user', async () => {
      mockUserRepository.getUserDetails.mockResolvedValue(mockAdminUser);
      mockPrisma.notification.findMany.mockResolvedValue([mockNotification]);

      const result = await service.findAll('admin-1');

      expect(mockUserRepository.getUserDetails).toHaveBeenCalledWith('admin-1');
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { receiver_id: { equals: 'admin-1' } },
              { receiver_id: { equals: null } },
            ]),
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('should return empty data when no notifications exist', async () => {
      mockUserRepository.getUserDetails.mockResolvedValue(mockAdminUser);
      mockPrisma.notification.findMany.mockResolvedValue([]);

      const result = await service.findAll('admin-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should append avatar_url for notifications with sender avatar', async () => {
      mockUserRepository.getUserDetails.mockResolvedValue(mockAdminUser);
      const notifWithAvatar = {
        ...mockNotification,
        sender: { ...mockNotification.sender, avatar: 'avatar.png' },
      };
      mockPrisma.notification.findMany.mockResolvedValue([notifWithAvatar]);

      const result = await service.findAll('admin-1');

      expect(result.success).toBe(true);
      expect((result.data[0].sender as any).avatar_url).toContain('avatar.png');
    });

    it('should return failure response when userRepository throws', async () => {
      mockUserRepository.getUserDetails.mockRejectedValue(new Error('User lookup failed'));

      const result = await service.findAll('bad-id');

      expect(result.success).toBe(false);
      expect(result.message).toBe('User lookup failed');
    });
  });

  describe('remove', () => {
    it('should delete notification and return success', async () => {
      mockPrisma.notification.findUnique.mockResolvedValue(mockNotification);
      mockPrisma.notification.delete.mockResolvedValue(mockNotification);

      const result = await service.remove('notif-1', 'admin-1');

      expect(mockPrisma.notification.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'notif-1' } }),
      );
      expect(mockPrisma.notification.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'notif-1' } }),
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Notification deleted successfully');
    });

    it('should return failure when notification is not found', async () => {
      mockPrisma.notification.findUnique.mockResolvedValue(null);

      const result = await service.remove('bad-id', 'admin-1');

      expect(mockPrisma.notification.delete).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.message).toBe('Notification not found');
    });

    it('should return failure response when prisma throws', async () => {
      mockPrisma.notification.findUnique.mockRejectedValue(new Error('DB error'));

      const result = await service.remove('notif-1', 'admin-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('DB error');
    });
  });

  describe('removeAll', () => {
    it('should delete all notifications for user and return success', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([mockNotification]);
      mockPrisma.notification.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.removeAll('admin-1');

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ receiver_id: 'admin-1' }, { receiver_id: null }] },
        }),
      );
      expect(mockPrisma.notification.deleteMany).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.message).toBe('All notifications deleted successfully');
    });

    it('should return failure when no notifications exist', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      const result = await service.removeAll('admin-1');

      expect(mockPrisma.notification.deleteMany).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.message).toBe('Notification not found');
    });

    it('should return failure response when prisma throws', async () => {
      mockPrisma.notification.findMany.mockRejectedValue(new Error('DB error'));

      const result = await service.removeAll('admin-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('DB error');
    });
  });
});
