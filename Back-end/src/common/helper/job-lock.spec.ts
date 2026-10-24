import Redis from 'ioredis';
import { __setJobLockRedis, withBookingLock, withJobLock } from './job-lock';

const prismaWith = (locked: boolean) =>
  ({
    $transaction: (fn: any) => fn({ $queryRaw: async () => [{ locked }] }),
  }) as any;

describe('withJobLock', () => {
  it('runs the job when it gets the lock', async () => {
    const job = jest.fn().mockResolvedValue(3);
    await expect(withJobLock(prismaWith(true), 'x', job)).resolves.toBe(3);
    expect(job).toHaveBeenCalledTimes(1);
  });

  it('skips the job when another server holds the lock', async () => {
    const job = jest.fn();
    await expect(withJobLock(prismaWith(false), 'x', job)).resolves.toBeUndefined();
    expect(job).not.toHaveBeenCalled();
  });
});

describe('withJobLock with Redis (production)', () => {
  // a tiny in-memory Redis: SET NX PX and the compare-and-delete release
  const fakeRedis = () => {
    const store = new Map<string, string>();
    return {
      store,
      set: jest.fn(async (k: string, v: string, _px: string, _ttl: number, nx: string) => {
        if (nx === 'NX' && store.has(k)) return null;
        store.set(k, v);
        return 'OK';
      }),
      eval: jest.fn(async (_s: string, _n: number, k: string, token: string) => (store.get(k) === token ? Number(store.delete(k)) : 0)),
    };
  };
  afterEach(() => __setJobLockRedis(undefined));
  const noDb = { $transaction: jest.fn() } as any;

  it('runs the job without touching the database, then lets the lock go', async () => {
    const r = fakeRedis();
    __setJobLockRedis(r as unknown as Redis);
    await expect(withJobLock(noDb, 'sweep', async () => 7)).resolves.toBe(7);
    expect(noDb.$transaction).not.toHaveBeenCalled();
    expect(r.set).toHaveBeenCalledWith('vendly-job:sweep', expect.any(String), 'PX', 3600000, 'NX');
    expect(r.store.size).toBe(0);
  });

  it('skips while another server runs it, and releases even when the job fails', async () => {
    const r = fakeRedis();
    __setJobLockRedis(r as unknown as Redis);
    let release!: () => void;
    const first = withJobLock(noDb, 'sweep', () => new Promise<string>((ok) => (release = () => ok('first'))));
    await new Promise((ok) => setImmediate(ok));
    const job = jest.fn();
    await expect(withJobLock(noDb, 'sweep', job)).resolves.toBeUndefined();
    expect(job).not.toHaveBeenCalled();
    release();
    await expect(first).resolves.toBe('first');
    await expect(withJobLock(noDb, 'sweep', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(r.store.size).toBe(0);
  });

  it("never deletes a lock another run took after this one's expired", async () => {
    const r = fakeRedis();
    __setJobLockRedis(r as unknown as Redis);
    await withJobLock(noDb, 'sweep', async () => {
      r.store.set('vendly-job:sweep', 'someone-else');
    });
    expect(r.store.get('vendly-job:sweep')).toBe('someone-else');
  });
});

describe('withBookingLock', () => {
  const prisma = (claims: number[], exists = true) => {
    const updateMany = jest.fn();
    for (const c of claims) updateMany.mockResolvedValueOnce({ count: c });
    updateMany.mockResolvedValue({ count: 1 });
    return { booking: { updateMany, findUnique: jest.fn().mockResolvedValue(exists ? { id: 'b1' } : null) } } as any;
  };

  it('claims the booking, runs the work and lets the lock go, even when the work fails', async () => {
    const p = prisma([1]);
    await expect(withBookingLock(p, 'b1', async () => 'done')).resolves.toBe('done');
    await expect(withBookingLock(p, 'b1', async () => Promise.reject(new Error('stripe down')))).rejects.toThrow('stripe down');
    const releases = p.booking.updateMany.mock.calls.filter((c: any) => c[0].data.money_lock_token === null);
    expect(releases).toHaveLength(2);
  });

  it('waits while someone else holds it', async () => {
    const p = prisma([0, 1]);
    const work = jest.fn().mockResolvedValue(1);
    await withBookingLock(p, 'b1', work);
    expect(p.booking.updateMany.mock.calls[0][0].data.money_lock_token).toEqual(expect.any(String));
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('runs straight away for a booking that does not exist (the work reports it)', async () => {
    const p = prisma([0], false);
    const work = jest.fn().mockResolvedValue(null);
    await withBookingLock(p, 'nope', work);
    expect(work).toHaveBeenCalledTimes(1);
  });
});
