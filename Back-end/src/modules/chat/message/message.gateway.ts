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
import appConfig from '../../../config/app.config';

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

  public clients = new Map<string, string>();

  constructor(@Optional() private readonly prisma?: PrismaService) {}

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

      // a suspended or deleted account's access token still verifies until it expires: no live updates for it
      if (this.prisma) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true, deleted_at: true } });
        if (!user || user.deleted_at || user.status === 0) {
          client.disconnect();
          return;
        }
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

  // There is deliberately no client "sendMessage" event: messages are sent through the API, which
  // checks the sender is in the conversation, and the server pushes them out. A socket relay let any
  // connected user deliver a message with a made-up sender to anyone.

  /**
   * Typing indicator. Clients send { conversation_id } at most every couple of seconds while typing
   * and `stopTyping` when they go idle or send; the other participants get it on their user rooms
   * (which survive reconnects, unlike conversation rooms). Non-participants are ignored.
   */
  @SubscribeMessage('typing')
  async handleTyping(client: Socket, @MessageBody() body: { conversation_id: string }) {
    const sender = await this.typingRelay(client, body?.conversation_id);
    if (!sender) return;
    this.server
      .to(sender.others)
      .emit('userTyping', { conversation_id: body.conversation_id, user_id: sender.userId, name: sender.name });
  }

  @SubscribeMessage('stopTyping')
  async handleStopTyping(client: Socket, @MessageBody() body: { conversation_id: string }) {
    const sender = await this.typingRelay(client, body?.conversation_id);
    if (!sender) return;
    this.server
      .to(sender.others)
      .emit('userStoppedTyping', { conversation_id: body.conversation_id, user_id: sender.userId });
  }

  /** The typer's name and the other participants' user rooms, or null if they aren't in the chat. */
  private async typingRelay(client: Socket, conversationId?: string) {
    const userId = client.data?.userId;
    if (!userId || !conversationId || typeof conversationId !== 'string' || !this.prisma) return null;
    const members = await this.prisma.participant.findMany({
      where: { conversationId },
      select: { userId: true, user: { select: { name: true } } },
    });
    const me = members.find((m) => m.userId === userId);
    if (!me) return null;
    const others = members.filter((m) => m.userId !== userId).map((m) => `user_${m.userId}`);
    if (!others.length) return null;
    return { userId, name: me.user?.name ?? 'Someone', others };
  }

  // Voice/video call signalling and call recording were removed: no app or website used them, and
  // they trusted whatever username, caller and recording id a client sent (anyone could take over
  // another user's calls, and a crafted recording id wrote files outside the recordings folder).

  // Emit booking notification to a specific user via their room
  emitBookingEvent(userId: string, event: string, data: any) {
    this.server.to(`user_${userId}`).emit(event, data);
  }
}
