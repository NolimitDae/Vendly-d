import { Test, TestingModule } from '@nestjs/testing';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

const mockNotificationService = {
  findAllNotificationsForUser: jest.fn(),
  deleteNotificationForUser: jest.fn(),
};

const mockReq = (userId: string): any => ({ user: { userId } });

describe('NotificationController', () => {
  let controller: NotificationController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NotificationController>(NotificationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAllUserNotifications', () => {
    it('should return all notifications for the authenticated user', async () => {
      const expected = {
        success: true,
        message: 'Notifications retrieved successfully',
        data: [{ id: 'notif-1', message: 'New booking' }],
      };
      mockNotificationService.findAllNotificationsForUser.mockResolvedValue(expected);

      const result = await controller.getAllUserNotifications(mockReq('user-1'));

      expect(result).toEqual(expected);
      expect(mockNotificationService.findAllNotificationsForUser).toHaveBeenCalledWith('user-1');
    });

    it('should return empty data when user has no notifications', async () => {
      mockNotificationService.findAllNotificationsForUser.mockResolvedValue({
        success: true,
        message: 'Notifications retrieved successfully',
        data: [],
      });

      const result = await controller.getAllUserNotifications(mockReq('user-no-notifs'));

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('deleteUserNotification', () => {
    it('should delete a notification and return success response', async () => {
      const expected = {
        success: true,
        message: 'Notification deleted successfully',
        data: { id: 'notif-1' },
      };
      mockNotificationService.deleteNotificationForUser.mockResolvedValue(expected);

      const result = await controller.deleteUserNotification(mockReq('user-1'), 'notif-1');

      expect(result).toEqual(expected);
      expect(mockNotificationService.deleteNotificationForUser).toHaveBeenCalledWith(
        'notif-1',
        'user-1',
      );
    });

    it('should propagate error when notification does not exist or does not belong to user', async () => {
      mockNotificationService.deleteNotificationForUser.mockRejectedValue(
        new Error('Record to delete does not exist'),
      );

      await expect(
        controller.deleteUserNotification(mockReq('user-1'), 'bad-id'),
      ).rejects.toThrow('Record to delete does not exist');
    });
  });
});
