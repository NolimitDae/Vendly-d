import { withJobLock } from './job-lock';

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
