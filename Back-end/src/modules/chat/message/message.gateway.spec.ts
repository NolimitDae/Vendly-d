import { Test, TestingModule } from '@nestjs/testing';
import { MessageGateway } from './message.gateway';
import { PrismaService } from '../../../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';

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
  data: {},
  emit: jest.fn(),
  ...overrides,
});

const prisma = { participant: { findFirst: jest.fn(), findMany: jest.fn() }, user: { findUnique: jest.fn() } };

describe('MessageGateway', () => {
  let gateway: MessageGateway;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ status: 1, deleted_at: null });
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessageGateway, { provide: PrismaService, useValue: prisma }],
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

  describe('handleConnection', () => {
    it('accepts a token sent in the handshake auth payload (browsers)', async () => {
      jest.spyOn(jwt, 'verify').mockReturnValue({ sub: 'user-1' } as any);
      const client = makeSocket({ handshake: { headers: {}, auth: { token: 'browser.jwt' } } });

      await gateway.handleConnection(client);

      expect(jwt.verify).toHaveBeenCalledWith('browser.jwt', expect.anything());
      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.join).toHaveBeenCalledWith('user_user-1');
    });

    it('still accepts the Authorization header (native clients)', async () => {
      jest.spyOn(jwt, 'verify').mockReturnValue({ sub: 'user-2' } as any);
      const client = makeSocket();

      await gateway.handleConnection(client);

      expect(jwt.verify).toHaveBeenCalledWith('valid.jwt.token', expect.anything());
      expect(client.join).toHaveBeenCalledWith('user_user-2');
    });

    it('rejects refresh tokens', async () => {
      jest.spyOn(jwt, 'verify').mockReturnValue({ sub: 'user-1', typ: 'refresh' } as any);
      const client = makeSocket();

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('disconnects a suspended account', async () => {
      jest.spyOn(jwt, 'verify').mockReturnValue({ sub: 'user-1' } as any);
      prisma.user.findUnique.mockResolvedValue({ status: 0, deleted_at: null });
      const client = makeSocket();

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('disconnects when no token is sent', async () => {
      const client = makeSocket({ handshake: { headers: {} } });

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
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
    it('joins a conversation the user is part of', async () => {
      prisma.participant.findFirst.mockResolvedValue({ id: 'p1' });
      const client = makeSocket({ data: { userId: 'user-1' } });

      await gateway.handleRoomJoin(client, { room_id: 'room-42' });

      expect(prisma.participant.findFirst).toHaveBeenCalledWith({ where: { conversationId: 'room-42', userId: 'user-1' }, select: { id: true } });
      expect(client.join).toHaveBeenCalledWith('room-42');
      expect(client.emit).toHaveBeenCalledWith('joinedRoom', { room_id: 'room-42' });
    });

    it('refuses a conversation the user is not in', async () => {
      prisma.participant.findFirst.mockResolvedValue(null);
      const client = makeSocket({ data: { userId: 'intruder' } });

      await gateway.handleRoomJoin(client, { room_id: 'room-42' });

      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('joinRefused', { room_id: 'room-42' });
    });

    it('ignores a room id that is not plain text', async () => {
      const client = makeSocket({ data: { userId: 'user-1' } });
      await gateway.handleRoomJoin(client, { room_id: { not: '' } } as any);
      expect(prisma.participant.findFirst).not.toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('ignores sockets that never authenticated', async () => {
      const client = makeSocket({ data: {} });
      await gateway.handleRoomJoin(client, { room_id: 'room-42' });
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('handleRoomLeave', () => {
    it('leaves a chat room, but never the user’s own room', () => {
      const client = makeSocket({ data: { userId: 'user-1' } });
      (client as any).leave = jest.fn();
      gateway.handleRoomLeave(client, { room_id: 'room-42' });
      expect((client as any).leave).toHaveBeenCalledWith('room-42');
      gateway.handleRoomLeave(client, { room_id: 'user_user-1' });
      gateway.handleRoomLeave(client, { room_id: { not: '' } } as any);
      expect((client as any).leave).toHaveBeenCalledTimes(1);
    });
  });

  it('has no client-to-client message relay (messages go through the API)', () => {
    expect((gateway as any).listenForMessages).toBeUndefined();
  });

  it('has no unauthenticated call signalling or recording upload', () => {
    for (const handler of ['handleJoin', 'handleCall', 'handleAnswer', 'handleICECandidate', 'handleEndCall', 'handleRecordingChunk', 'handleRecordingEnd']) {
      expect((gateway as any)[handler]).toBeUndefined();
    }
  });

  describe('typing indicator', () => {
    const members = [
      { userId: 'user-1', user: { name: 'Alice' } },
      { userId: 'user-2', user: { name: 'Bob' } },
    ];

    it("relays typing to the other participants only, with the typer's name", async () => {
      prisma.participant.findMany.mockResolvedValue(members);
      const client = makeSocket({ data: { userId: 'user-1' } });

      await gateway.handleTyping(client, { conversation_id: 'conv-1' });

      expect(prisma.participant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { conversationId: 'conv-1' } }));
      expect((gateway as any).server.to).toHaveBeenCalledWith(['user_user-2']);
      expect((gateway as any).server.emit).toHaveBeenCalledWith('userTyping', { conversation_id: 'conv-1', user_id: 'user-1', name: 'Alice' });
    });

    it('relays stopTyping the same way', async () => {
      prisma.participant.findMany.mockResolvedValue(members);
      const client = makeSocket({ data: { userId: 'user-2' } });

      await gateway.handleStopTyping(client, { conversation_id: 'conv-1' });

      expect((gateway as any).server.to).toHaveBeenCalledWith(['user_user-1']);
      expect((gateway as any).server.emit).toHaveBeenCalledWith('userStoppedTyping', { conversation_id: 'conv-1', user_id: 'user-2' });
    });

    it('drops typing from someone who is not in the conversation', async () => {
      prisma.participant.findMany.mockResolvedValue(members);
      const client = makeSocket({ data: { userId: 'intruder' } });

      await gateway.handleTyping(client, { conversation_id: 'conv-1' });
      await gateway.handleStopTyping(client, { conversation_id: 'conv-1' });

      expect((gateway as any).server.emit).not.toHaveBeenCalled();
    });

    it('ignores unauthenticated sockets and payloads without a conversation', async () => {
      await gateway.handleTyping(makeSocket({ data: {} }), { conversation_id: 'conv-1' });
      await gateway.handleTyping(makeSocket({ data: { userId: 'user-1' } }), { to: 'user-2', data: {} } as any);

      expect(prisma.participant.findMany).not.toHaveBeenCalled();
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
