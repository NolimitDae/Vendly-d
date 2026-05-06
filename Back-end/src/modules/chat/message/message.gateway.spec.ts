import { Test, TestingModule } from '@nestjs/testing';
import { MessageGateway } from './message.gateway';

// Suppress filesystem side-effects in the constructor
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

const makeSocket = (overrides: Partial<any> = {}): any => ({
  id: 'socket-abc',
  handshake: {
    headers: { authorization: 'Bearer valid.jwt.token' },
  },
  disconnect: jest.fn(),
  join: jest.fn(),
  emit: jest.fn(),
  ...overrides,
});

describe('MessageGateway', () => {
  let gateway: MessageGateway;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessageGateway],
    }).compile();

    gateway = module.get<MessageGateway>(MessageGateway);

    // Attach a mock server so methods that reference this.server don't throw
    (gateway as any).server = {
      to: jest.fn().mockReturnThis(),
      except: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('should expose a public clients map', () => {
    expect(gateway.clients).toBeInstanceOf(Map);
  });

  describe('afterInit', () => {
    it('should complete without throwing', () => {
      const mockServer: any = {};
      expect(() => gateway.afterInit(mockServer)).not.toThrow();
    });
  });

  describe('handleDisconnect', () => {
    it('should remove client from the map and emit userStatusChange', async () => {
      gateway.clients.set('user-1', 'socket-abc');
      const client = makeSocket({ id: 'socket-abc' });

      await gateway.handleDisconnect(client);

      expect(gateway.clients.has('user-1')).toBe(false);
      expect((gateway as any).server.emit).toHaveBeenCalledWith(
        'userStatusChange',
        { user_id: 'user-1', status: 'offline' },
      );
    });

    it('should not emit when socket id is not tracked', async () => {
      const client = makeSocket({ id: 'unknown-socket' });

      await gateway.handleDisconnect(client);

      expect((gateway as any).server.emit).not.toHaveBeenCalled();
    });
  });

  describe('handleRoomJoin', () => {
    it('should join the room and emit joinedRoom event', () => {
      const client = makeSocket();

      gateway.handleRoomJoin(client, { room_id: 'room-42' });

      expect(client.join).toHaveBeenCalledWith('room-42');
      expect(client.emit).toHaveBeenCalledWith('joinedRoom', { room_id: 'room-42' });
    });

    it('should join different rooms independently', () => {
      const client1 = makeSocket({ id: 'socket-1' });
      const client2 = makeSocket({ id: 'socket-2' });

      gateway.handleRoomJoin(client1, { room_id: 'room-A' });
      gateway.handleRoomJoin(client2, { room_id: 'room-B' });

      expect(client1.join).toHaveBeenCalledWith('room-A');
      expect(client2.join).toHaveBeenCalledWith('room-B');
    });
  });

  describe('listenForMessages', () => {
    it('should forward message to recipient socket when they are online', async () => {
      gateway.clients.set('user-2', 'socket-user2');

      await gateway.listenForMessages(makeSocket(), {
        to: 'user-2',
        data: { sender: { id: 'user-1' }, text: 'Hi' },
      });

      expect((gateway as any).server.to).toHaveBeenCalledWith('socket-user2');
      expect((gateway as any).server.emit).toHaveBeenCalledWith('message', expect.objectContaining({
        from: 'user-1',
      }));
    });

    it('should not emit when recipient is not connected', async () => {
      await gateway.listenForMessages(makeSocket(), {
        to: 'offline-user',
        data: { sender: { id: 'user-1' }, text: 'Hi' },
      });

      expect((gateway as any).server.emit).not.toHaveBeenCalled();
    });
  });

  describe('handleTyping', () => {
    it('should emit userTyping to recipient when they are online', () => {
      gateway.clients.set('user-2', 'socket-user2');
      const client = makeSocket();

      gateway.handleTyping(client, { to: 'user-2', data: { isTyping: true } });

      expect((gateway as any).server.to).toHaveBeenCalledWith('socket-user2');
      expect((gateway as any).server.emit).toHaveBeenCalledWith(
        'userTyping',
        expect.objectContaining({ from: client.id }),
      );
    });

    it('should not emit when recipient is offline', () => {
      gateway.handleTyping(makeSocket(), { to: 'offline-user', data: {} });

      expect((gateway as any).server.emit).not.toHaveBeenCalled();
    });
  });

  describe('emitBookingEvent', () => {
    it('should emit the given event to the user room with data', () => {
      gateway.emitBookingEvent('user-1', 'bookingConfirmed', { bookingId: 'b-1' });

      expect((gateway as any).server.to).toHaveBeenCalledWith('user_user-1');
      expect((gateway as any).server.emit).toHaveBeenCalledWith('bookingConfirmed', {
        bookingId: 'b-1',
      });
    });

    it('should use the correct room format for different users', () => {
      gateway.emitBookingEvent('vendor-99', 'bookingCancelled', { reason: 'late' });

      expect((gateway as any).server.to).toHaveBeenCalledWith('user_vendor-99');
    });
  });
});
