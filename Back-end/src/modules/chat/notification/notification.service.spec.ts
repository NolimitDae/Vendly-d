import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { PrismaService } from 'src/prisma/prisma.service';

const mockNotification = {
  id: 'notif-1',
  receiver_id: 'user-1',
  message: 'You have a new booking',
  created_at: new Date(),
};

const mockPrisma = {
  notification: {
    findMany: jest.fn(),
    delete: jest.fn(),
  },
};

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAllNotificationsForUser', () => {
    it('should return all notifications for the given user', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([mockNotification]);

      const result = await service.findAllNotificationsForUser('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('notif-1');
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { receiver_id: 'user-1' },
          orderBy: { created_at: 'desc' },
        }),
      );
    });

    it('should return an empty data array when the user has no notifications', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      const result = await service.findAllNotificationsForUser('user-no-notifs');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('deleteNotificationForUser', () => {
    it('should delete a notification and return the deleted record', async () => {
      mockPrisma.notification.delete.mockResolvedValue(mockNotification);

      const result = await service.deleteNotificationForUser('notif-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Notification deleted successfully');
      expect(result.data).toEqual(mockNotification);
      expect(mockPrisma.notification.delete).toHaveBeenCalledWith({
        where: { id: 'notif-1', receiver_id: 'user-1' },
      });
    });

    it('should propagate error when prisma delete throws (e.g. record not found)', async () => {
      mockPrisma.notification.delete.mockRejectedValue(
        new Error('Record to delete does not exist'),
      );

      await expect(
        service.deleteNotificationForUser('bad-id', 'user-1'),
      ).rejects.toThrow('Record to delete does not exist');
    });
  });
});
