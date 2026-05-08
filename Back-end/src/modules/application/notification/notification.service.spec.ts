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

  describe('create', () => {
    it('should create a notification event and a notification record', async () => {
      const mockEvent = { id: 'event-1', type: 'MESSAGE', text: 'Hello' };
      const mockNotification = {
        id: 'notif-1',
        receiver_id: 'user-2',
        sender_id: 'user-1',
        notification_event_id: 'event-1',
        entity_id: 'entity-1',
      };
      mockPrisma.notificationEvent.create.mockResolvedValue(mockEvent);
      mockPrisma.notification.create.mockResolvedValue(mockNotification);

      const result = await service.create({
        receiver_id: 'user-2',
        sender_id: 'user-1',
        type: 'MESSAGE',
        text: 'Hello',
        entity_id: 'entity-1',
      });

      expect(mockPrisma.notificationEvent.create).toHaveBeenCalledWith({
        data: { type: 'MESSAGE', text: 'Hello' },
      });
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            receiver_id: 'user-2',
            notification_event_id: 'event-1',
          }),
        }),
      );
      expect(result).toEqual(mockNotification);
    });

    it('should create a notification without optional fields', async () => {
      mockPrisma.notificationEvent.create.mockResolvedValue({ id: 'event-2' });
      mockPrisma.notification.create.mockResolvedValue({ id: 'notif-2' });

      const result = await service.create({ receiver_id: 'user-3' });

      expect(result).toBeDefined();
      expect(mockPrisma.notificationEvent.create).toHaveBeenCalledWith({
        data: { type: undefined, text: undefined },
      });
    });
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
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { receiver_id: 'user-1', deleted_at: null } }),
      );
    });

    it('should return unread count of 0 when all are read', async () => {
      const notifs = [
        { id: 'n-3', read_at: new Date(), notification_event: null, sender: null },
      ];
      mockPrisma.notification.findMany.mockResolvedValue(notifs);

      const result = await service.findAllForUser('user-2');

      expect(result.unread).toBe(0);
    });
  });

  describe('markRead', () => {
    it('should mark a single notification as read and return success', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.markRead('n-1', 'user-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'n-1', receiver_id: 'user-1' },
          data: expect.objectContaining({ read_at: expect.any(Date) }),
        }),
      );
    });

    it('should still return success even when no rows are updated', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markRead('missing-id', 'user-1');

      expect(result.success).toBe(true);
    });
  });

  describe('markAllRead', () => {
    it('should mark all unread notifications as read', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAllRead('user-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { receiver_id: 'user-1', read_at: null },
        }),
      );
    });

    it('should return success when there are no unread notifications', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markAllRead('user-with-no-notifs');

      expect(result.success).toBe(true);
    });
  });

  describe('remove', () => {
    it('should soft-delete a notification and return success', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.remove('n-1', 'user-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'n-1', receiver_id: 'user-1' },
          data: expect.objectContaining({ deleted_at: expect.any(Date) }),
        }),
      );
    });

    it('should return success even if the notification was not found', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.remove('nonexistent', 'user-1');

      expect(result.success).toBe(true);
    });
  });
});
