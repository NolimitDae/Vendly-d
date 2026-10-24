import { UserRepository } from './user.repository';

const prisma: any = {
  user: { findFirst: jest.fn(), findUnique: jest.fn().mockResolvedValue({ balance: 0 }), delete: jest.fn(), update: jest.fn() },
  booking: { count: jest.fn() },
  paymentTransaction: { count: jest.fn().mockResolvedValue(0) },
  vendorContract: { count: jest.fn().mockResolvedValue(0) },
  contractSignature: { count: jest.fn().mockResolvedValue(0) },
  $transaction: jest.fn(),
};

describe('UserRepository account deletion', () => {
  const repo = new UserRepository(prisma);
  // [open, completed but not settled, open disputes]
  const counts = (active: number, unreleased: number, disputes: number) =>
    prisma.booking.count.mockResolvedValueOnce(active).mockResolvedValueOnce(unreleased).mockResolvedValueOnce(disputes);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ balance: 0 });
    prisma.paymentTransaction.count.mockResolvedValue(0);
  });

  it('is allowed when every booking is settled', async () => {
    counts(0, 0, 0);
    expect(await repo.deletionBlocker('u1')).toBeNull();
  });

  it('says what is still open and what to do', async () => {
    counts(2, 1, 1);
    expect(await repo.deletionBlocker('u1')).toBe(
      'You can’t delete your account yet. 2 bookings are still open: finish or cancel them first. 1 completed booking hasn’t been settled yet: the vendor is paid a few days after completion, once any payment due is made. 1 booking has an open dispute: Vendly will resolve it first. Then try again.',
    );
  });

  it('looks at bookings as customer or vendor, and only unsettled ones', async () => {
    counts(0, 0, 0);
    await repo.deletionBlocker('u1');
    const [active, unreleased, disputes] = prisma.booking.count.mock.calls.map((c: any) => c[0].where);
    expect(active).toMatchObject({ OR: [{ customer_id: 'u1' }, { vendor_id: 'u1' }], status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] } });
    // the customer/vendor OR is kept: the money condition goes in AND
    expect(unreleased).toMatchObject({ OR: [{ customer_id: 'u1' }, { vendor_id: 'u1' }], status: 'COMPLETED', released_at: null });
    expect(unreleased.AND[0].OR).toHaveLength(2);
    expect(disputes).toMatchObject({ dispute_opened_at: { not: null }, dispute_resolved_at: null });
  });

  it('refuses while money is in (or owed to) the Vendly balance', async () => {
    counts(0, 0, 0);
    prisma.user.findUnique.mockResolvedValueOnce({ balance: '312.5' });
    expect(await repo.deletionBlocker('u1')).toBe('You can’t delete your account yet. You have $312.50 in your Vendly balance: withdraw it first, or contact support if you can’t. Then try again.');
    counts(0, 0, 0);
    prisma.user.findUnique.mockResolvedValueOnce({ balance: -40 });
    expect(await repo.deletionBlocker('u1')).toContain('You owe Vendly $40.00 from an earlier refund: contact support to settle it');
  });

  it('refuses while a withdrawal is pending or being checked', async () => {
    counts(0, 0, 0);
    prisma.paymentTransaction.count.mockResolvedValueOnce(1);
    expect(await repo.deletionBlocker('u1')).toContain('1 withdrawal is still being processed: wait for it to finish, or contact support');
    expect(prisma.paymentTransaction.count).toHaveBeenCalledWith({ where: { user_id: 'u1', type: 'withdraw', status: { in: ['pending', 'needs_review'] } } });
  });

  it('neither deletes nor anonymises while something is open', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });
    counts(1, 0, 0);
    const res = await repo.deleteUser('u1');
    expect(res).toEqual({ success: false, message: expect.stringContaining('1 booking is still open') });
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
