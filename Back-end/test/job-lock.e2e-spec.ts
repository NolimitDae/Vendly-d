/**
 * Many scheduled jobs starting at once must not stall the database pool (they did when each held a
 * connection for its whole run), against a real Postgres + Redis:
 *   CONTRACTS_E2E_DATABASE_URL=postgresql://... REDIS_URL=redis://... yarn test:e2e job-lock
 */
import Redis from 'ioredis';

const DB = process.env.CONTRACTS_E2E_DATABASE_URL;
const run = DB ? describe : describe.skip;

jest.setTimeout(60_000);

run('Job locks and the database pool (e2e)', () => {
  it('runs more locked jobs at once than the pool has connections, without stalling', async () => {
    process.env.DATABASE_URL = DB;
    process.env.DB_POOL_MAX = '3';
    process.env.DB_POOL_WAIT_MS = '5000';
    const { PrismaService } = await import('../src/prisma/prisma.service');
    const { withJobLock, __setJobLockRedis } = await import('../src/common/helper/job-lock');
    const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
    __setJobLockRedis(redis);
    const prisma = new PrismaService();
    await prisma.$connect();
    try {
      const started = Date.now();
      // 8 different jobs on a 3-connection pool, each running a few queries
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          withJobLock(prisma, `pool-test-${i}-${started}`, async () => {
            for (let q = 0; q < 3; q++) await prisma.$queryRaw`SELECT pg_sleep(0.05)::text AS slept`;
            return i;
          }),
        ),
      );
      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(Date.now() - started).toBeLessThan(15_000);
    } finally {
      __setJobLockRedis(undefined);
      await prisma.$disconnect();
      redis.disconnect();
      delete process.env.DB_POOL_MAX;
      delete process.env.DB_POOL_WAIT_MS;
    }
  });
});
