import { ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Runs `job` only if no other server is already running the same one.
 * A Postgres session-level advisory lock is held for the length of the job on a connection from
 * the separate lock pool, so the job's own queries (and the API) never wait on it. Postgres drops
 * the lock if that connection dies, so a crash can never leave it stuck.
 * Returns undefined when another server holds the lock, or no lock connection is free.
 */
export async function withJobLock<T>(prisma: PrismaService, name: string, job: () => Promise<T>): Promise<T | undefined> {
  const key = createHash('sha1').update(`vendly-job:${name}`).digest().readBigInt64BE(0).toString();
  let client: PoolClient;
  try {
    client = await prisma.lockPool.connect();
  } catch {
    // every lock connection is busy or the database is unreachable: skip this run, the next one retries
    return undefined;
  }
  // a connection that fails a lock query is thrown away rather than reused, which also drops its lock
  let broken = false;
  try {
    const { rows } = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [key]).catch((err) => {
      broken = true;
      throw err;
    });
    if (!rows[0]?.locked) return undefined;
    try {
      return await job();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [key]).catch(() => (broken = true));
    }
  } finally {
    client.release(broken);
  }
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
