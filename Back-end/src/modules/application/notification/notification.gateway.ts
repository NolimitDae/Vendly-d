import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { NotificationService } from './notification.service';
import * as jwt from 'jsonwebtoken';
import appConfig from '../../../config/app.config';

/**
 * Who a socket belongs to: a verified access token or 2-minute socket token from the handshake
 * (`auth.token`, or an Authorization header from native clients). Refresh tokens don't count.
 */
export function socketUserId(client: Pick<Socket, 'handshake'>): string | null {
  const header = client.handshake.headers?.authorization;
  const token = (client.handshake.auth as { token?: string } | undefined)?.token ?? (typeof header === 'string' ? header.split(' ')[1] : undefined);
  if (!token) return null;
  try {
    const claims = jwt.verify(token, appConfig().jwt.secret) as { sub?: string; typ?: string };
    if (!claims?.sub || claims.typ === 'refresh') return null;
    return claims.sub;
  } catch {
    return null;
  }
}

@WebSocketGateway({
  cors: {
    origin: appConfig().app.client_app_url,
  },
})
export class NotificationGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private redisPubClient: Redis;
  private redisSubClient: Redis;

  private clients = new Map<string, string>(); // userId -> socketId

  constructor(private readonly notificationService: NotificationService) {}

  onModuleInit() {
    this.redisPubClient = new Redis(appConfig().redis);
    this.redisSubClient = new Redis(appConfig().redis);

    // subscribe's callback only reports the subscription; the published messages arrive as 'message' events
    this.redisSubClient.subscribe('notification', (err) => {
      if (err) this.logger.error('Redis subscription error', err);
    });
    this.redisSubClient.on('message', (channel: string, message: string) => {
      if (channel !== 'notification') return;
      this.deliver(message);
    });
  }

  /** A message from the 'notification' channel (any API instance) to the user's sockets on this one. */
  deliver(message: string) {
    let data: any;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }
    // to that user's own connections only, never to everyone
    if (typeof data?.userId === 'string') this.server?.to(`user_${data.userId}`).emit('receiveNotification', data);
  }

  afterInit(_server: Server) {
    this.logger.log('WebSocket server initialised');
  }

  /** Only a signed-in user (access or 2-minute socket token) is registered, and only as themselves. */
  async handleConnection(client: Socket) {
    const userId = socketUserId(client);
    if (!userId) return; // the chat gateway on the same connection disconnects unauthenticated sockets
    client.data.userId = userId;
    this.clients.set(userId, client.id);
    client.join(`user_${userId}`);
    this.logger.debug(`User ${userId} connected`);
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId as string | undefined;
    if (userId && this.clients.get(userId) === client.id) {
      this.clients.delete(userId);
      this.logger.debug(`User ${userId} disconnected`);
    }
  }

  /** Server-side only: deliver a live notification to one user's open apps. */
  async notifyUser(userId: string, data: Record<string, unknown>) {
    await this.redisPubClient.publish('notification', JSON.stringify({ ...data, userId }));
  }

  @SubscribeMessage('removeNotification')
  remove(@MessageBody() id: string, @ConnectedSocket() socket: Socket) {
    // whoever the connection was authenticated as, never a user id the client sends
    const userId = socket.data?.userId as string | undefined;
    if (!userId) return { success: false, message: 'Not signed in' };
    return this.notificationService.remove(id, userId);
  }
}
