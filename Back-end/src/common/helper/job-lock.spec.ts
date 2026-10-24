import { withBookingLock, withJobLock } from './job-lock';

const prismaWith = (locked: boolean, opts: { unlockFails?: boolean; connectFails?: boolean } = {}) => {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('pg_advisory_unlock') && opts.unlockFails) throw new Error('gone');
    return { rows: [{ locked }] };
  });
  const client = { query, release: jest.fn() };
  const connect = jest.fn(async () => {
    if (opts.connectFails) throw new Error('timeout exceeded when trying to connect');
    return client;
  });
  return { prisma: { lockPool: { connect } } as any, client };
};

describe('withJobLock', () => {
  it('runs the job on the lock pool, then unlocks and hands the connection back', async () => {
    const { prisma, client } = prismaWith(true);
    const job = jest.fn().mockResolvedValue(3);
    await expect(withJobLock(prisma, 'x', job)).resolves.toBe(3);
    expect(job).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenLastCalledWith('SELECT pg_advisory_unlock($1)', [expect.any(String)]);
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it('skips the job when another server holds the lock', async () => {
    const { prisma, client } = prismaWith(false);
    const job = jest.fn();
    await expect(withJobLock(prisma, 'x', job)).resolves.toBeUndefined();
    expect(job).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it('unlocks even when the job fails', async () => {
    const { prisma, client } = prismaWith(true);
    await expect(withJobLock(prisma, 'x', () => Promise.reject(new Error('stripe down')))).rejects.toThrow('stripe down');
    expect(client.query).toHaveBeenLastCalledWith('SELECT pg_advisory_unlock($1)', [expect.any(String)]);
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it('throws away a connection that could not unlock, so its lock is dropped', async () => {
    const { prisma, client } = prismaWith(true, { unlockFails: true });
    await expect(withJobLock(prisma, 'x', async () => 1)).resolves.toBe(1);
    expect(client.release).toHaveBeenCalledWith(true);
  });

  it('skips the run when no lock connection is free', async () => {
    const { prisma } = prismaWith(true, { connectFails: true });
    const job = jest.fn();
    await expect(withJobLock(prisma, 'x', job)).resolves.toBeUndefined();
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
