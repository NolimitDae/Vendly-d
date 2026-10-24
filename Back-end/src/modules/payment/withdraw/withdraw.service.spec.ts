import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { WithdrawService } from './withdraw.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';
import { PushService } from 'src/modules/push/push.service';

jest.mock('src/common/lib/Payment/stripe/StripePayment', () => ({
  StripePayment: {
    createConnectedAccount: jest.fn(),
    createOnboardingAccountLink: jest.fn(),
    createTransfer: jest.fn(),
    checkBalance: jest.fn(),
    retrieveAccount: jest.fn(),
    listTransfers: jest.fn(),
  },
}));
jest.mock('src/modules/push/push.service', () => ({ PushService: class {} }));

const mockPrisma: any = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  paymentTransaction: {
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};
const mockPush = { sendToUser: jest.fn().mockResolvedValue(undefined) };

const mockUser = {
  id: 'user-1',
  name: 'Jane Doe',
  email: 'jane@test.com',
  stripe_connect_id: null,
  balance: { toNumber: () => 500, valueOf: () => 500 } as any,
};

const mockUserWithConnect = {
  ...mockUser,
  stripe_connect_id: 'acct_connect_123',
};

describe('WithdrawService', () => {
  let service: WithdrawService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((fn: any) => (typeof fn === 'function' ? fn(mockPrisma) : Promise.all(fn)));
    // the balance is still there unless a test says otherwise
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.paymentTransaction.create.mockResolvedValue({ id: 'txn-pending' });
    mockPrisma.paymentTransaction.update.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PushService, useValue: mockPush },
      ],
    }).compile();

    service = module.get<WithdrawService>(WithdrawService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── createConnectedAccount ───────────────────────────────────────────────

  describe('createConnectedAccount', () => {
    it('should create and persist a Stripe connected account for a new user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (StripePayment.createConnectedAccount as jest.Mock).mockResolvedValue({
        id: 'acct_new_456',
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.createConnectedAccount('user-1', 'jane@test.com');

      expect(result.success).toBe(true);
      expect(result.data.accountId).toBe('acct_new_456');
      expect(StripePayment.createConnectedAccount).toHaveBeenCalledWith(
        'jane@test.com',
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { stripe_connect_id: 'acct_new_456' },
        }),
      );
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.createConnectedAccount('ghost-user', 'nobody@test.com'),
      ).rejects.toThrow(NotFoundException);

      expect(StripePayment.createConnectedAccount).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when user already has a connected account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserWithConnect);

      await expect(
        service.createConnectedAccount('user-1', 'jane@test.com'),
      ).rejects.toThrow(BadRequestException);

      expect(StripePayment.createConnectedAccount).not.toHaveBeenCalled();
    });

    it('should throw HttpException when Stripe call fails', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (StripePayment.createConnectedAccount as jest.Mock).mockRejectedValue(
        new Error('Stripe network error'),
      );

      await expect(
        service.createConnectedAccount('user-1', 'jane@test.com'),
      ).rejects.toThrow(HttpException);
    });
  });

  // ─── createOnboardingLink ─────────────────────────────────────────────────

  describe('createOnboardingLink', () => {
    it('should return an onboarding URL for a valid account id', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ stripe_connect_id: 'acct_connect_123' });
      (StripePayment.createOnboardingAccountLink as jest.Mock).mockResolvedValue({
        url: 'https://connect.stripe.com/onboard/acct_123',
      });

      const result = await service.createOnboardingLink('acct_connect_123', 'user-1');

      expect(result.success).toBe(true);
      expect(result.data.url).toBe('https://connect.stripe.com/onboard/acct_123');
      expect(StripePayment.createOnboardingAccountLink).toHaveBeenCalledWith(
        'acct_connect_123',
      );
    });

    it('should throw HttpException when Stripe onboarding call fails', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ stripe_connect_id: 'acct_bad' });
      (StripePayment.createOnboardingAccountLink as jest.Mock).mockRejectedValue(
        new Error('Stripe error'),
      );

      await expect(
        service.createOnboardingLink('acct_bad', 'user-1'),
      ).rejects.toThrow(HttpException);
    });

    it("should refuse a link for someone else's payout account", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ stripe_connect_id: 'acct_mine' });

      await expect(
        service.createOnboardingLink('acct_someone_else', 'user-1'),
      ).rejects.toThrow(NotFoundException);
      expect(StripePayment.createOnboardingAccountLink).not.toHaveBeenCalled();
    });
  });

  // ─── processWithdraw ──────────────────────────────────────────────────────

  describe('processWithdraw', () => {
    const withdrawDto = { amount: 100, currency: 'usd' };

    it('takes the balance first, then sends the transfer keyed on the pending record', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserWithConnect);
      (StripePayment.createTransfer as jest.Mock).mockResolvedValue({
        id: 'tr_transfer_001',
      });

      const result = await service.processWithdraw('user-1', withdrawDto);

      expect(result.success).toBe(true);
      expect(result.data?.transfer_id).toBe('tr_transfer_001');
      expect(result.data?.status).toBe('completed');
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', balance: { gte: 100 } },
        data: { balance: { decrement: 100 } },
      });
      expect(mockPrisma.paymentTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ user_id: 'user-1', type: 'withdraw', status: 'pending', amount: 100 }) }),
      );
      expect(StripePayment.createTransfer).toHaveBeenCalledWith(mockUserWithConnect.stripe_connect_id, 100, 'usd', 'withdraw-txn-pending', 'txn-pending');
      // the balance is only taken once, before the transfer
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.paymentTransaction.update).toHaveBeenCalledWith({
        where: { id: 'txn-pending' },
        data: expect.objectContaining({ reference_number: 'tr_transfer_001', status: 'completed' }),
      });
    });

    it('sends nothing when a second request already took the balance', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserWithConnect);
      mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.processWithdraw('user-1', withdrawDto)).rejects.toThrow('Withdraw amount exceeds available balance');
      expect(StripePayment.createTransfer).not.toHaveBeenCalled();
      expect(mockPrisma.paymentTransaction.create).not.toHaveBeenCalled();
    });

    it('rounds to whole cents', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserWithConnect);
      (StripePayment.createTransfer as jest.Mock).mockResolvedValue({ id: 'tr_2' });
      await service.processWithdraw('user-1', { amount: 20.005, currency: 'usd' });
      expect(StripePayment.createTransfer).toHaveBeenCalledWith('acct_connect_123', 20.01, 'usd', 'withdraw-txn-pending', 'txn-pending');
    });

    it('puts the money back when Stripe turns the transfer down', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserWithConnect);
      (StripePayment.createTransfer as jest.Mock).mockRejectedValue(Object.assign(new Error('No such destination'), { statusCode: 400 }));

      await expect(service.processWithdraw('user-1', withdrawDto)).rejects.toThrow(HttpException);
      expect(StripePayment.createTransfer).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { balance: { increment: 100 } } });
      expect(mockPrisma.paymentTransaction.update).toHaveBeenCalledWith({ where: { id: 'txn-pending' }, data: { status: 'failed' } });
    });

    it('tries once more with the same key when Stripe did not answer', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserWithConnect);
      (StripePayment.createTransfer as jest.Mock).mockRejectedValueOnce(new Error('socket hang up')).mockResolvedValueOnce({ id: 'tr_3' });

      const result = await service.processWithdraw('user-1', withdrawDto);
      expect(result.data?.transfer_id).toBe('tr_3');
      expect(StripePayment.createTransfer).toHaveBeenNthCalledWith(2, 'acct_connect_123', 100, 'usd', 'withdraw-txn-pending', 'txn-pending');
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('keeps the money off the balance for review when the outcome is still unknown', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserWithConnect);
      (StripePayment.createTransfer as jest.Mock).mockRejectedValue(new Error('socket hang up'));

      await expect(service.processWithdraw('user-1', withdrawDto)).rejects.toThrow(/Vendly is checking it/);
      // it may have gone through: never credited back automatically
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.paymentTransaction.update).toHaveBeenCalledWith({ where: { id: 'txn-pending' }, data: { status: 'needs_review' } });
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.processWithdraw('ghost-user', withdrawDto),
      ).rejects.toThrow(NotFoundException);

      expect(StripePayment.createTransfer).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when user has no connected account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser); // stripe_connect_id is null

      await expect(
        service.processWithdraw('user-1', withdrawDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when user balance is zero', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUserWithConnect,
        balance: { toNumber: () => 0, valueOf: () => 0 } as any,
      });

      await expect(
        service.processWithdraw('user-1', withdrawDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses less than the $20 minimum the website shows', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserWithConnect);

      await expect(
        service.processWithdraw('user-1', { amount: 19.99, currency: 'usd' }),
      ).rejects.toThrow('Minimum withdraw amount is $20');
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when amount exceeds available balance', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUserWithConnect,
        balance: { toNumber: () => 50, valueOf: () => 50 } as any,
      });

      await expect(
        service.processWithdraw('user-1', { amount: 200, currency: 'usd' }),
      ).rejects.toThrow(BadRequestException);
    });

  });

  // ─── checkAccountBalance ──────────────────────────────────────────────────

  describe('checkAccountBalance', () => {
    it('should return formatted available and pending balances', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        stripe_connect_id: 'acct_connect_123',
      });
      (StripePayment.checkBalance as jest.Mock).mockResolvedValue({
        available: [{ amount: 5000, currency: 'usd' }],
        pending: [{ amount: 1000, currency: 'usd' }],
      });

      const result = await service.checkAccountBalance('user-1');

      expect(result.success).toBe(true);
      expect(result.data.available.amount).toBe(50); // 5000 cents / 100
      expect(result.data.pending.amount).toBe(10); // 1000 cents / 100
      expect(result.data.total.amount).toBe(60);
      expect(StripePayment.checkBalance).toHaveBeenCalledWith('acct_connect_123');
    });

    it('should throw BadRequestException when user has no connected account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        stripe_connect_id: null,
      });

      await expect(
        service.checkAccountBalance('user-1'),
      ).rejects.toThrow(BadRequestException);

      expect(StripePayment.checkBalance).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.checkAccountBalance('ghost-user'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw HttpException when Stripe balance check fails', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        stripe_connect_id: 'acct_connect_123',
      });
      (StripePayment.checkBalance as jest.Mock).mockRejectedValue(
        new Error('Balance check error'),
      );

      await expect(
        service.checkAccountBalance('user-1'),
      ).rejects.toThrow(HttpException);
    });
  });

  // ─── getWithdrawHistory ───────────────────────────────────────────────────

  describe('getWithdrawHistory', () => {
    it('should return all withdraw transactions for the user', async () => {
      const mockTransactions = [
        { id: 'txn-1', type: 'withdraw', amount: 100, status: 'completed' },
        { id: 'txn-2', type: 'withdraw', amount: 50, status: 'failed' },
      ];
      mockPrisma.paymentTransaction.findMany.mockResolvedValue(mockTransactions);

      const result = await service.getWithdrawHistory('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(mockPrisma.paymentTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user-1', type: 'withdraw' },
          orderBy: { created_at: 'desc' },
        }),
      );
    });

    it('should return an empty data array when the user has no withdraw history', async () => {
      mockPrisma.paymentTransaction.findMany.mockResolvedValue([]);

      const result = await service.getWithdrawHistory('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  // ─── getConnectedAccountInfo ──────────────────────────────────────────────

  describe('getConnectedAccountInfo', () => {
    it('should return connected account info with hasConnectedAccount true', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        stripe_connect_id: 'acct_connect_123',
        email: 'jane@test.com',
        name: 'Jane Doe',
      });

      const result = await service.getConnectedAccountInfo('user-1');

      expect(result.success).toBe(true);
      expect(result.data.hasConnectedAccount).toBe(true);
      expect(result.data.accountId).toBe('acct_connect_123');
      expect(result.data.email).toBe('jane@test.com');
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          select: { stripe_connect_id: true, email: true, name: true },
        }),
      );
    });

    it("should include Stripe's setup status for a connected account", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ stripe_connect_id: 'acct_connect_123', email: 'jane@test.com', name: 'Jane Doe' });
      (StripePayment.retrieveAccount as jest.Mock).mockResolvedValue({ payouts_enabled: false, details_submitted: true, charges_enabled: false });

      const result: any = await service.getConnectedAccountInfo('user-1');

      expect(result.data).toEqual(expect.objectContaining({ accountId: 'acct_connect_123', payouts_enabled: false, details_submitted: true }));
    });

    it('should still answer when Stripe cannot be reached', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ stripe_connect_id: 'acct_connect_123', email: 'jane@test.com', name: 'Jane Doe' });
      (StripePayment.retrieveAccount as jest.Mock).mockRejectedValue(new Error('down'));
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const result: any = await service.getConnectedAccountInfo('user-1');

      expect(result.data.hasConnectedAccount).toBe(true);
      expect(result.data.payouts_enabled).toBeUndefined();
    });

    it('should return hasConnectedAccount false when stripe_connect_id is null', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        stripe_connect_id: null,
        email: 'jane@test.com',
        name: 'Jane Doe',
      });

      const result = await service.getConnectedAccountInfo('user-1');

      expect(result.success).toBe(true);
      expect(result.data.hasConnectedAccount).toBe(false);
      expect(result.data.accountId).toBeNull();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.getConnectedAccountInfo('ghost-user'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── needs_review withdrawals ─────────────────────────────────────────────

  describe('withdrawals Stripe did not confirm', () => {
    const now = new Date('2026-10-24T12:00:00Z');
    const created = new Date('2026-10-24T09:00:00Z');
    const row = { id: 'w1', type: 'withdraw', status: 'needs_review', user_id: 'user-1', amount: 150, currency: 'usd', created_at: created };

    beforeEach(() => {
      mockPrisma.paymentTransaction.findMany.mockResolvedValue([row]);
      mockPrisma.paymentTransaction.findUnique.mockResolvedValue(row);
      mockPrisma.paymentTransaction.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.findUnique.mockResolvedValue({ stripe_connect_id: 'acct_connect_123' });
    });

    it('marks it completed when its transfer is found by its group', async () => {
      (StripePayment.listTransfers as jest.Mock).mockResolvedValueOnce([{ id: 'tr_9', amount: 15000 }]);
      expect(await service.reviewWithdrawals(now)).toEqual([{ id: 'w1', outcome: 'completed' }]);
      expect(StripePayment.listTransfers).toHaveBeenCalledWith({ transferGroup: 'withdraw_w1' });
      // only rows old enough that a request in flight has finished
      expect(mockPrisma.paymentTransaction.findMany.mock.calls[0][0].where).toEqual({ type: 'withdraw', status: 'needs_review', created_at: { lte: new Date('2026-10-24T11:00:00Z') } });
      expect(mockPrisma.paymentTransaction.updateMany).toHaveBeenCalledWith({
        where: { id: 'w1', type: 'withdraw', status: 'needs_review' },
        data: { status: 'completed', paid_amount: 150, paid_currency: 'usd', reference_number: 'tr_9' },
      });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPush.sendToUser).toHaveBeenCalledWith('user-1', expect.objectContaining({ title: 'Withdrawal sent' }), 'payments');
    });

    it('finds an older withdrawal’s plain transfer by account, amount and time', async () => {
      (StripePayment.listTransfers as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'tr_booking', amount: 15000, transfer_group: 'booking_b1', metadata: { booking_id: 'b1' } },
          { id: 'tr_other', amount: 9900, transfer_group: null, metadata: {} },
          { id: 'tr_old', amount: 15000, transfer_group: null, metadata: {} },
        ]);
      mockPrisma.paymentTransaction.findMany.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
      expect(await service.reviewWithdrawals(now)).toEqual([{ id: 'w1', outcome: 'completed' }]);
      const at = Math.floor(created.getTime() / 1000);
      expect(StripePayment.listTransfers).toHaveBeenLastCalledWith({ destination: 'acct_connect_123', createdFrom: at - 300, createdTo: at + 3600 });
      expect(mockPrisma.paymentTransaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reference_number: 'tr_old' }) }));
    });

    it('puts the money back and marks it failed when no transfer was made', async () => {
      (StripePayment.listTransfers as jest.Mock).mockResolvedValue([]);
      expect(await service.reviewWithdrawals(now)).toEqual([{ id: 'w1', outcome: 'returned' }]);
      expect(mockPrisma.paymentTransaction.updateMany).toHaveBeenCalledWith({ where: { id: 'w1', type: 'withdraw', status: 'needs_review' }, data: { status: 'failed' } });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { balance: { increment: 150 } } });
      expect(mockPush.sendToUser).toHaveBeenCalledWith('user-1', expect.objectContaining({ body: expect.stringContaining('back in your Vendly balance') }), 'payments');
    });

    it('leaves it for an admin when two transfers could be it, or Stripe does not answer', async () => {
      (StripePayment.listTransfers as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([
        { id: 'tr_a', amount: 15000, transfer_group: null, metadata: {} },
        { id: 'tr_b', amount: 15000, transfer_group: null, metadata: {} },
      ]);
      mockPrisma.paymentTransaction.findMany.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
      expect(await service.reviewWithdrawals(now)).toEqual([]);
      (StripePayment.listTransfers as jest.Mock).mockRejectedValueOnce(new Error('timeout'));
      expect(await service.reviewWithdrawals(now)).toEqual([]);
      expect(mockPrisma.paymentTransaction.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('never credits twice: an admin and the check can’t both settle it', async () => {
      mockPrisma.paymentTransaction.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      await service.adminSettle('w1', 'returned');
      await expect(service.adminSettle('w1', 'returned')).rejects.toThrow('already settled');
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
    });

    it('lists the ones waiting for a check', async () => {
      mockPrisma.paymentTransaction.findMany.mockResolvedValueOnce([{ id: 'w1', amount: '150.00', currency: 'usd', created_at: created, user: { id: 'user-1', name: 'Jane', email: 'j@x.test', stripe_connect_id: 'acct_1' } }]);
      const res = await service.listNeedsReview();
      expect(res.data[0]).toMatchObject({ id: 'w1', amount: 150, user: { name: 'Jane' } });
      expect(mockPrisma.paymentTransaction.findMany.mock.calls[0][0].where).toEqual({ type: 'withdraw', status: 'needs_review' });
    });
  });
});
