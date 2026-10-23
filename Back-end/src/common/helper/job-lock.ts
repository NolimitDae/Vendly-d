import { createHash } from 'crypto';
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

/**
 * Runs `work` while holding a lock on one booking's money (charges, captures, refunds, payouts), so
 * two of them never act on the same installments at once. Waits for the lock rather than skipping.
 * Never call another locked function from inside `work`: it would wait on itself.
 */
export async function withBookingLock<T>(prisma: PrismaService, bookingId: string, work: () => Promise<T>): Promise<T> {
  const key = createHash('sha1').update(`vendly-booking-money:${bookingId}`).digest().readBigInt64BE(0);
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${key})`;
      return work();
    },
    { maxWait: 10_000, timeout: 5 * 60 * 1000 },
  );
}
