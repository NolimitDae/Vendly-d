import { ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Runs `job` only if no other server is already running the same one.
 * A Postgres transaction-level advisory lock is held for the length of the job and is released
 * automatically on commit, rollback or a dropped connection, so a crash can never leave it stuck.
 * Returns undefined when another server holds the lock.
 */
export async function withJobLock<T>(prisma: PrismaService, name: string, job: () => Promise<T>): Promise<T | undefined> {
  // shortcut: a job longer than one hour loses its lock transaction, raise the timeout if one ever does
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
