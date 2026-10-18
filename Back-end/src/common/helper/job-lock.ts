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
