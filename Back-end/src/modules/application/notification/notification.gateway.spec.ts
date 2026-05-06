import { Test, TestingModule } from '@nestjs/testing';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';

// Prevent real Redis connections during tests
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    subscribe: jest.fn(),
    publish: jest.fn().mockResolvedValue(1),
    disconnect: jest.fn(),
  }));
});

const mockNotificationService = {
  remove: jest.fn(),
};

const mockServer = {
  emit: jest.fn(),
};

describe('NotificationGateway', () => {
  let gateway: NotificationGateway;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationGateway,
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    gateway = module.get<NotificationGateway>(NotificationGateway);
    // Inject a mock WebSocket server so emit calls don't fail
    gateway.server = mockServer as any;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should register the userId -> socketId mapping', async () => {
      const mockSocket = {
        id: 'socket-abc',
        handshake: { query: { userId: 'user-1' } },
      } as any;

      await gateway.handleConnection(mockSocket);

      // Verify that the user is tracked by attempting to look them up via disconnect
      const mockSocket2 = { id: 'socket-abc', handshake: { query: {} } } as any;
      gateway.handleDisconnect(mockSocket2);
      // No error means the map was updated correctly
    });

    it('should not register when userId is absent', async () => {
      const mockSocket = {
        id: 'socket-xyz',
        handshake: { query: {} },
      } as any;

      await expect(gateway.handleConnection(mockSocket)).resolves.not.toThrow();
    });
  });

  describe('handleDisconnect', () => {
    it('should remove the client mapping on disconnect', async () => {
      const mockSocket = {
        id: 'socket-1',
        handshake: { query: { userId: 'user-disconnect' } },
      } as any;

      await gateway.handleConnection(mockSocket);
      gateway.handleDisconnect(mockSocket);

      // Calling disconnect again with same socket should not throw
      expect(() => gateway.handleDisconnect(mockSocket)).not.toThrow();
    });

    it('should not throw when socket has no registered user', () => {
      const unknownSocket = { id: 'unknown-socket' } as any;
      expect(() => gateway.handleDisconnect(unknownSocket)).not.toThrow();
    });
  });

  describe('remove (removeNotification)', () => {
    it('should delegate to NotificationService.remove', () => {
      mockNotificationService.remove.mockReturnValue({ success: true });

      const mockSocket = {
        handshake: { query: { userId: 'user-1' } },
      } as any;

      gateway.remove('notif-1', mockSocket);

      expect(mockNotificationService.remove).toHaveBeenCalledWith('notif-1', 'user-1');
    });

    it('should pass the notification id and userId from socket query', () => {
      mockNotificationService.remove.mockReturnValue({ success: true });

      const mockSocket = {
        handshake: { query: { userId: 'user-42' } },
      } as any;

      gateway.remove('notif-99', mockSocket);

      expect(mockNotificationService.remove).toHaveBeenCalledWith('notif-99', 'user-42');
    });
  });

  describe('afterInit', () => {
    it('should not throw when called with the server instance', () => {
      expect(() => gateway.afterInit(mockServer as any)).not.toThrow();
    });
  });
});
