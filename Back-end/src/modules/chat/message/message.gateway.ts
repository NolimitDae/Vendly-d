import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import * as path from 'path';
import * as fs from 'fs';
import appConfig from '../../../config/app.config';

enum MessageStatus {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  PENDING = 'PENDING',
}

@WebSocketGateway({
  cors: { origin: '*' },
  maxHttpBufferSize: 1e8,
})
export class MessageGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessageGateway.name);
  private chunks = new Map<string, Buffer>();
  private uploadsDir = path.join(__dirname, '../../../../public/storage/recordings');

  public clients = new Map<string, string>();
  private activeUsers = new Map<string, string>();

  constructor(@Optional() private readonly prisma?: PrismaService) {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  onModuleInit() {}

  afterInit(_server: Server) {
    this.logger.log('WebSocket server started');
  }

  async handleConnection(client: Socket) {
    try {
      // Browsers send the token in the handshake `auth` payload (WebSockets can't carry custom
      // headers); native clients may still use the Authorization header.
      const authHeader = client.handshake.headers.authorization;
      const token = client.handshake.auth?.token ?? authHeader?.split(' ')[1];
      if (!token) {
        client.disconnect();
        return;
      }

      const decoded: any = jwt.verify(token, appConfig().jwt.secret);
      const { sub: userId } = decoded;

      // Refresh tokens are not session credentials.
      if (!userId || decoded.typ === 'refresh') {
        client.disconnect();
        return;
      }

      this.clients.set(userId, client.id);
      client.data.userId = userId;
      client.join(`user_${userId}`);
      this.logger.log(`User ${userId} connected`);
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = [...this.clients.entries()].find(
      ([, socketId]) => socketId === client.id,
    )?.[0];

    if (userId) {
      this.clients.delete(userId);
      const username = [...this.activeUsers.entries()].find(
        ([, id]) => id === client.id,
      )?.[0];
      if (username) this.activeUsers.delete(username);

      this.server.emit('userStatusChange', { user_id: userId, status: 'offline' });
      this.logger.log(`User ${userId} disconnected`);
    }
  }

  /** Only participants may listen to a conversation (rooms are named by conversation id). */
  @SubscribeMessage('joinroom')
  async handleRoomJoin(client: Socket, body: { room_id: string }) {
    const userId = client.data?.userId;
    const roomId = body?.room_id;
    if (!userId || !roomId || !this.prisma) return;
    const member = await this.prisma.participant.findFirst({ where: { conversationId: roomId, userId }, select: { id: true } });
    if (!member) {
      client.emit('joinRefused', { room_id: roomId });
      return;
    }
    client.join(roomId);
    client.emit('joinedRoom', { room_id: roomId });
  }

  @SubscribeMessage('sendMessage')
  async listenForMessages(
    client: Socket,
    @MessageBody() body: { to: string; data: any },
  ) {
    const recipientSocketId = this.clients.get(body.to);
    if (recipientSocketId) {
      this.server.to(recipientSocketId).emit('message', {
        from: body.data.sender.id,
        data: body.data,
      });
    }
  }

  @SubscribeMessage('updateMessageStatus')
  async updateMessageStatus(
    client: Socket,
    @MessageBody() body: { message_id: string; status: MessageStatus },
  ) {
    this.server.emit('messageStatusUpdated', {
      message_id: body.message_id,
      status: body.status,
    });
  }

  @SubscribeMessage('typing')
  handleTyping(client: Socket, @MessageBody() body: { to: string; data: any }) {
    const recipientSocketId = this.clients.get(body.to);
    if (recipientSocketId) {
      this.server.to(recipientSocketId).emit('userTyping', { from: client.id, data: body.data });
    }
  }

  @SubscribeMessage('stopTyping')
  handleStopTyping(client: Socket, @MessageBody() body: { to: string; data: any }) {
    const recipientSocketId = this.clients.get(body.to);
    if (recipientSocketId) {
      this.server.to(recipientSocketId).emit('userStoppedTyping', { from: client.id, data: body.data });
    }
  }

  @SubscribeMessage('join')
  handleJoin(client: Socket, { username }: { username: string }) {
    this.activeUsers.set(username, client.id);
  }

  @SubscribeMessage('call')
  handleCall(client: Socket, { caller, receiver, offer }: { caller: string; receiver: string; offer: any }) {
    const receiverSocketId = this.activeUsers.get(receiver);
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('incomingCall', { caller, offer });
    }
  }

  @SubscribeMessage('answer')
  handleAnswer(client: Socket, { caller, answer }: { caller: string; receiver: string; answer: any }) {
    const callerSocketId = this.activeUsers.get(caller);
    if (callerSocketId) {
      this.server.to(callerSocketId).emit('callAccepted', { answer });
    }
  }

  @SubscribeMessage('iceCandidate')
  handleICECandidate(client: Socket, { receiver, candidate }: { receiver: string; candidate: any }) {
    const receiverSocketId = this.activeUsers.get(receiver);
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('iceCandidate', { candidate });
    }
  }

  @SubscribeMessage('endCall')
  handleEndCall(client: Socket, { receiver }: { receiver: string }) {
    const receiverSocketId = this.activeUsers.get(receiver);
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('callEnded');
    }
  }

  @SubscribeMessage('recordingChunk')
  handleRecordingChunk(
    client: Socket,
    @MessageBody() payload: { recordingId: string; sequence: number; chunk: Buffer | any },
  ) {
    const { recordingId, chunk } = payload;
    const existing = this.chunks.get(recordingId) ?? Buffer.alloc(0);
    this.chunks.set(recordingId, Buffer.concat([existing, Buffer.from(new Uint8Array(chunk))]));
  }

  @SubscribeMessage('recordingEnded')
  handleRecordingEnd(client: Socket, @MessageBody() payload: { recordingId: string }) {
    const filePath = path.join(this.uploadsDir, `${payload.recordingId}.webm`);
    const buffer = this.chunks.get(payload.recordingId);
    if (buffer) {
      fs.writeFileSync(filePath, buffer);
      this.chunks.delete(payload.recordingId);
    }
  }

  // Emit booking notification to a specific user via their room
  emitBookingEvent(userId: string, event: string, data: any) {
    this.server.to(`user_${userId}`).emit(event, data);
  }
}
