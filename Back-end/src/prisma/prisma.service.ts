import {
  Logger,
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import appConfig from '../config/app.config';
import { PrismaClient } from 'prisma/generated/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  /**
   * Connections kept apart from Prisma's pool, only for scheduled-job locks (see withJobLock).
   * Sized above the number of locked jobs (12) so jobs that start in the same minute never skip each other.
   * A job holds its lock for as long as it runs; doing that on Prisma's own pool used up every
   * connection the jobs and the API needed, and logins hung.
   */
  readonly lockPool: Pool;

  constructor() {
    const datasourceUrl = appConfig().database.url;

    if (!datasourceUrl) {
      throw new Error('DATABASE_URL is not defined in environment variables');
    }

    const adapter = new PrismaPg({ connectionString: datasourceUrl });

    super({
      adapter,
    });

    this.lockPool = new Pool({ connectionString: datasourceUrl, max: 16, connectionTimeoutMillis: 5000 });
    this.lockPool.on('error', (err) => this.logger.warn(`Job lock connection error: ${err.message}`));

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
    await this.lockPool.end().catch(() => undefined);
    await this.$disconnect();
  }
}
