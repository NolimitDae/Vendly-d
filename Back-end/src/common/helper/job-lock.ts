import { ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import Redis from 'ioredis';
import appConfig from 'src/config/app.config';
import { PrismaService } from 'src/prisma/prisma.service';

const HOUR_MS = 60 * 60 * 1000;

/** Releases the lock only if this run still owns it (it may have expired and been taken by another). */
const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;

let lockRedis: Redis | null | undefined;
/** The Redis the job locks live in (null in unit tests, which use the database lock below). */
function jobLockRedis(): Redis | null {
  if (lockRedis !== undefined) return lockRedis;
  lockRedis = process.env.NODE_ENV === 'test' && !process.env.JOB_LOCK_REDIS ? null : new Redis({ ...appConfig().redis, maxRetriesPerRequest: 2 });
  return lockRedis;
}
/** Test hook: use this Redis (or the database lock with null). */
export const __setJobLockRedis = (r: Redis | null | undefined) => {
  lockRedis = r;
};

/**
 * Runs `job` only if no other server is already running the same one; returns undefined when another
 * server holds the lock. The lock is a Redis key with an expiry (released when the job ends, and on its
 * own after `ttlMs` if a server dies mid-way), so a running job never holds a database connection:
 * jobs holding one each for their whole run used up the pool when several started at once and
 * stalled every request.
 */
export async function withJobLock<T>(prisma: PrismaService, name: string, job: () => Promise<T>, ttlMs = HOUR_MS): Promise<T | undefined> {
  const redis = jobLockRedis();
  if (!redis) return withDatabaseJobLock(prisma, name, job);
  const key = `vendly-job:${name}`;
  const token = randomUUID();
  if ((await redis.set(key, token, 'PX', ttlMs, 'NX')) !== 'OK') return undefined;
  try {
    return await job();
  } finally {
    await redis.eval(RELEASE, 1, key, token).catch(() => undefined);
  }
}

/** Unit tests only: a transaction-level advisory lock (holds one connection while the job runs). */
async function withDatabaseJobLock<T>(prisma: PrismaService, name: string, job: () => Promise<T>): Promise<T | undefined> {
  const key = createHash('sha1').update(`vendly-job:${name}`).digest().readBigInt64BE(0);
  return prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${key}) AS locked`;
      return locked ? job() : undefined;
    },
    { maxWait: 5000, timeout: HOUR_MS },
  );
}

const MONEY_LOCK_MS = 5 * 60 * 1000;
const MONEY_LOCK_WAIT_MS = 20_000;

/**
 * Runs `work` while holding a lock on one booking's money (charges, captures, refunds, payouts), so
 * two of them never act on the same installments at once. Waits up to 20 seconds for the lock.
 * The lock is a claimed row value, not a held connection, so waiting never ties up the pool; it
 * expires on its own after 5 minutes if a server dies mid-way.
 * Never call another locked function from inside `work`: it would wait on itself.
 */
export async function withBookingLock<T>(prisma: PrismaService, bookingId: string, work: () => Promise<T>): Promise<T> {
  const token = randomUUID();
  const deadline = Date.now() + MONEY_LOCK_WAIT_MS;
  for (;;) {
    const now = new Date();
    const claimed = await prisma.booking.updateMany({
      where: { id: bookingId, OR: [{ money_lock_until: null }, { money_lock_until: { lt: now } }] },
      data: { money_lock_until: new Date(now.getTime() + MONEY_LOCK_MS), money_lock_token: token },
    });
    if (claimed.count === 1) break;
    // no such booking: nothing to protect, let `work` report it
    if (!(await prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true } }))) return work();
    if (Date.now() > deadline) throw new ServiceUnavailableException('Another payment on this booking is in progress. Please try again in a minute.');
    await new Promise((r) => setTimeout(r, 250));
  }
  try {
    return await work();
  } finally {
    await prisma.booking
      .updateMany({ where: { id: bookingId, money_lock_token: token }, data: { money_lock_until: null, money_lock_token: null } })
      .catch(() => undefined);
  }
}
