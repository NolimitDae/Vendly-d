import { Test, TestingModule } from '@nestjs/testing';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';

const mockNotificationService = {
  findAll: jest.fn(),
  remove: jest.fn(),
  removeAll: jest.fn(),
};

const mockNotification = {
  id: 'notif-1',
  sender_id: 'user-1',
  receiver_id: 'admin-1',
  entity_id: 'entity-1',
  created_at: new Date('2024-01-01'),
};

const mockRequest = (userId: string) =>
  ({ user: { userId } }) as any;

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
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NotificationController>(NotificationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call service.findAll with userId from request and return notifications', async () => {
      const expected = { success: true, data: [mockNotification] };
      mockNotificationService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(mockRequest('admin-1'));

      expect(mockNotificationService.findAll).toHaveBeenCalledWith('admin-1');
      expect(result).toEqual(expected);
    });

    it('should return empty data when no notifications exist', async () => {
      mockNotificationService.findAll.mockResolvedValue({ success: true, data: [] });

      const result = await controller.findAll(mockRequest('admin-1'));

      expect(result).toEqual({ success: true, data: [] });
    });

    it('should return error object when service throws', async () => {
      mockNotificationService.findAll.mockRejectedValue(new Error('Service error'));

      const result = await controller.findAll(mockRequest('admin-1'));

      expect(result).toEqual({ success: false, message: 'Service error' });
    });
  });

  describe('remove', () => {
    it('should call service.remove with id and userId from request', async () => {
      const expected = { success: true, message: 'Notification deleted successfully' };
      mockNotificationService.remove.mockResolvedValue(expected);

      const result = await controller.remove(mockRequest('admin-1'), 'notif-1');

      expect(mockNotificationService.remove).toHaveBeenCalledWith('notif-1', 'admin-1');
      expect(result).toEqual(expected);
    });

    it('should return failure when notification not found', async () => {
      const expected = { success: false, message: 'Notification not found' };
      mockNotificationService.remove.mockResolvedValue(expected);

      const result = await controller.remove(mockRequest('admin-1'), 'bad-id');

      expect(result).toEqual(expected);
    });

    it('should return error object when service throws', async () => {
      mockNotificationService.remove.mockRejectedValue(new Error('Delete error'));

      const result = await controller.remove(mockRequest('admin-1'), 'notif-1');

      expect(result).toEqual({ success: false, message: 'Delete error' });
    });
  });

  describe('removeAll', () => {
    it('should call service.removeAll with userId from request', async () => {
      const expected = { success: true, message: 'All notifications deleted successfully' };
      mockNotificationService.removeAll.mockResolvedValue(expected);

      const result = await controller.removeAll(mockRequest('admin-1'));

      expect(mockNotificationService.removeAll).toHaveBeenCalledWith('admin-1');
      expect(result).toEqual(expected);
    });

    it('should return failure when no notifications exist', async () => {
      const expected = { success: false, message: 'Notification not found' };
      mockNotificationService.removeAll.mockResolvedValue(expected);

      const result = await controller.removeAll(mockRequest('admin-1'));

      expect(result).toEqual(expected);
    });

    it('should return error object when service throws', async () => {
      mockNotificationService.removeAll.mockRejectedValue(new Error('Delete all error'));

      const result = await controller.removeAll(mockRequest('admin-1'));

      expect(result).toEqual({ success: false, message: 'Delete all error' });
    });
  });
});
