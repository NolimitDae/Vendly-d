import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { PrismaService } from 'src/prisma/prisma.service';

const mockPrisma = {
  notificationEvent: { create: jest.fn() },
  notification: {
    create: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
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

  describe('findAllForUser', () => {
    it('should return notifications and unread count', async () => {
      const notifs = [
        { id: 'n-1', read_at: null, notification_event: null, sender: null },
        { id: 'n-2', read_at: new Date(), notification_event: null, sender: null },
      ];
      mockPrisma.notification.findMany.mockResolvedValue(notifs);

      const result = await service.findAllForUser('user-1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.unread).toBe(1);
    });
  });

  describe('markRead', () => {
    it('should mark a notification as read', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.markRead('n-1', 'user-1');
      expect(result.success).toBe(true);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'n-1', receiver_id: 'user-1' } }),
      );
    });
  });

  describe('markAllRead', () => {
    it('should mark all unread notifications as read', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAllRead('user-1');
      expect(result.success).toBe(true);
    });
  });
});
