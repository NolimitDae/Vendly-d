import {
  Logger,
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import appConfig from '../config/app.config';
import { PrismaClient } from 'prisma/generated/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const datasourceUrl = appConfig().database.url;

    if (!datasourceUrl) {
      throw new Error('DATABASE_URL is not defined in environment variables');
    }

    // a bigger pool than pg's default 10, and a wait limit so a busy pool fails a request instead of
    // hanging it forever
    const adapter = new PrismaPg({
      connectionString: datasourceUrl,
      max: Number(process.env.DB_POOL_MAX) || 25,
      connectionTimeoutMillis: Number(process.env.DB_POOL_WAIT_MS) || 15_000,
    });

    super({
      adapter,
    });

    if (process.env.PRISMA_ENV == '1') {
      this.logger.log('Prisma Middleware disabled');
    }
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
