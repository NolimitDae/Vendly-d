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
import appConfig from '../../../config/app.config';

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_APP_URL || 'http://localhost:3000',
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
    this.redisPubClient = new Redis({
      host: appConfig().redis.host,
      port: Number(appConfig().redis.port),
      password: appConfig().redis.password,
    });

    this.redisSubClient = new Redis({
      host: appConfig().redis.host,
      port: Number(appConfig().redis.port),
      password: appConfig().redis.password,
    });

    this.redisSubClient.subscribe('notification', (err, message: string) => {
      if (err) {
        this.logger.error('Redis subscription error', err);
        return;
      }
      const data = JSON.parse(message);
      this.server.emit('receiveNotification', data);
    });
  }

  afterInit(_server: Server) {
    this.logger.log('WebSocket server initialised');
  }

  async handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      this.clients.set(userId, client.id);
      this.logger.debug(`User ${userId} connected`);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = [...this.clients.entries()].find(
      ([, socketId]) => socketId === client.id,
    )?.[0];
    if (userId) {
      this.clients.delete(userId);
      this.logger.debug(`User ${userId} disconnected`);
    }
  }

  @SubscribeMessage('sendNotification')
  async handleNotification(@MessageBody() data: any) {
    const targetSocketId = this.clients.get(data.userId);
    if (targetSocketId) {
      await this.redisPubClient.publish('notification', JSON.stringify(data));
    }
  }

  @SubscribeMessage('removeNotification')
  remove(@MessageBody() id: string, @ConnectedSocket() socket: Socket) {
    const userId = socket.handshake.query.userId as string;
    return this.notificationService.remove(id, userId);
  }
}
