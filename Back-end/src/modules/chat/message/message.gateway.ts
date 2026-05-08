import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, OnModuleInit } from '@nestjs/common';
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

  constructor() {
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
      const authHeader = client.handshake.headers.authorization;
      if (!authHeader) {
        client.disconnect();
        return;
      }

      const token = authHeader.split(' ')[1];
      if (!token) {
        client.disconnect();
        return;
      }

      const decoded: any = jwt.verify(token, appConfig().jwt.secret);
      const { sub: userId } = decoded;

      if (!userId) {
        client.disconnect();
        return;
      }

      this.clients.set(userId, client.id);
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

  @SubscribeMessage('joinroom')
  handleRoomJoin(client: Socket, body: { room_id: string }) {
    client.join(body.room_id);
    client.emit('joinedRoom', { room_id: body.room_id });
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
