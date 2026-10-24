import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import appConfig from '../../../config/app.config';
import { NotificationGateway, socketUserId } from './notification.gateway';
import { NotificationService } from './notification.service';

// Prevent real Redis connections during tests
const publish = jest.fn().mockResolvedValue(1);
// like ioredis: subscribe's callback only confirms the subscription, messages come as 'message' events
let onMessage: ((channel: string, message: string) => void) | undefined;
jest.mock('ioredis', () => {
  const Redis = jest.fn().mockImplementation(() => ({
    subscribe: jest.fn((_channel: string, cb?: (err: unknown, count: number) => void) => cb?.(null, 1)),
    on: jest.fn((event: string, cb: any) => {
      if (event === 'message') onMessage = cb;
    }),
    publish,
    disconnect: jest.fn(),
  }));
  return { __esModule: true, default: Redis };
});

const mockNotificationService = { remove: jest.fn() };
const room = { emit: jest.fn() };
const mockServer = { emit: jest.fn(), to: jest.fn(() => room) };

const secret = appConfig().jwt.secret;
const token = (claims: Record<string, unknown>, key = secret) => jwt.sign(claims, key);
const sock = (handshake: any = {}, id = 'socket-1') => ({ id, handshake: { headers: {}, auth: {}, query: {}, ...handshake }, data: {} as any, join: jest.fn() });

describe('NotificationGateway', () => {
  let gateway: NotificationGateway;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationGateway, { provide: NotificationService, useValue: mockNotificationService }],
    }).compile();
    gateway = module.get<NotificationGateway>(NotificationGateway);
    gateway.server = mockServer as any;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('who a socket belongs to', () => {
    it('comes from a verified token, never from a user id the client sends', () => {
      expect(socketUserId(sock({ query: { userId: 'victim' } }) as any)).toBeNull();
      expect(socketUserId(sock({ auth: { token: 'not-a-jwt' } }) as any)).toBeNull();
      expect(socketUserId(sock({ auth: { token: token({ sub: 'u1' }, 'wrong-secret') } }) as any)).toBeNull();
      expect(socketUserId(sock({ auth: { token: token({ sub: 'u1', typ: 'refresh' }) } }) as any)).toBeNull();
      expect(socketUserId(sock({ auth: { token: token({ sub: 'u1', typ: 'socket' }) } }) as any)).toBe('u1');
      expect(socketUserId(sock({ headers: { authorization: `Bearer ${token({ sub: 'u2' })}` } }) as any)).toBe('u2');
    });
  });

  describe('handleConnection', () => {
    it('puts a signed-in socket in its own room', async () => {
      const s = sock({ auth: { token: token({ sub: 'user-1' }) } });
      await gateway.handleConnection(s as any);
      expect(s.join).toHaveBeenCalledWith('user_user-1');
      expect(s.data.userId).toBe('user-1');
    });

    it('registers nothing for a socket without a valid token, even with a userId in the query', async () => {
      const s = sock({ query: { userId: 'user-1' } });
      await expect(gateway.handleConnection(s as any)).resolves.not.toThrow();
      expect(s.join).not.toHaveBeenCalled();
      expect(s.data.userId).toBeUndefined();
    });
  });

  describe('handleDisconnect', () => {
    it('removes the mapping and is safe to call twice', async () => {
      const s = sock({ auth: { token: token({ sub: 'user-disconnect' }) } });
      await gateway.handleConnection(s as any);
      gateway.handleDisconnect(s as any);
      expect(() => gateway.handleDisconnect(s as any)).not.toThrow();
    });

    it('does not throw for a socket with no registered user', () => {
      expect(() => gateway.handleDisconnect({ id: 'unknown-socket' } as any)).not.toThrow();
    });
  });

  describe('delivery', () => {
    it("sends a notification to that user's room only, never to everyone", () => {
      gateway.onModuleInit();
      onMessage?.('notification', JSON.stringify({ userId: 'u1', title: 'Booking confirmed' }));
      expect(mockServer.to).toHaveBeenCalledWith('user_u1');
      expect(room.emit).toHaveBeenCalledWith('receiveNotification', expect.objectContaining({ title: 'Booking confirmed' }));
      expect(mockServer.emit).not.toHaveBeenCalled();
    });

    it('drops a message with no user', () => {
      gateway.onModuleInit();
      onMessage?.('notification', JSON.stringify({ title: 'For everyone?' }));
      expect(mockServer.to).not.toHaveBeenCalled();
      expect(mockServer.emit).not.toHaveBeenCalled();
    });

    it('ignores other channels and messages that are not JSON', () => {
      gateway.onModuleInit();
      onMessage?.('other', JSON.stringify({ userId: 'u1' }));
      onMessage?.('notification', 'not json');
      expect(mockServer.to).not.toHaveBeenCalled();
    });

    it('lets the server notify one user', async () => {
      gateway.onModuleInit();
      await gateway.notifyUser('u9', { title: 'Hi' });
      expect(publish).toHaveBeenCalledWith('notification', JSON.stringify({ title: 'Hi', userId: 'u9' }));
    });
  });

  describe('remove (removeNotification)', () => {
    it('removes only as the signed-in user, ignoring the query', async () => {
      mockNotificationService.remove.mockReturnValue({ success: true });
      const s = sock({ query: { userId: 'victim' } });
      s.data.userId = 'user-42';
      await gateway.remove('notif-99', s as any);
      expect(mockNotificationService.remove).toHaveBeenCalledWith('notif-99', 'user-42');
    });

    it('refuses an unauthenticated socket', async () => {
      expect(await gateway.remove('notif-1', sock({ query: { userId: 'victim' } }) as any)).toMatchObject({ success: false });
      expect(mockNotificationService.remove).not.toHaveBeenCalled();
    });
  });

  describe('afterInit', () => {
    it('should not throw when called with the server instance', () => {
      expect(() => gateway.afterInit(mockServer as any)).not.toThrow();
    });
  });
});
