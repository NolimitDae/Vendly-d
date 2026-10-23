import { withBookingLock, withJobLock } from './job-lock';

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
