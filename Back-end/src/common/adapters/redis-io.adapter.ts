import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import appConfig from '../../config/app.config';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  async connectToRedis(): Promise<void> {
    const cfg = appConfig().redis;
    const redisOpts = {
      host: cfg.host,
      port: +cfg.port,
      ...(cfg.password ? { password: cfg.password } : {}),
      connectTimeout: 5000,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => (times > 2 ? null : times * 500),
    };

    const pubClient = new Redis(redisOpts);
    const subClient = pubClient.duplicate();

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
