import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { WithdrawService } from './withdraw.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';

jest.mock('src/common/lib/Payment/stripe/StripePayment', () => ({
  StripePayment: {
    createConnectedAccount: jest.fn(),
    createOnboardingAccountLink: jest.fn(),
    createTransfer: jest.fn(),
    checkBalance: jest.fn(),
  },
}));

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  paymentTransaction: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawService,
        { provide: PrismaService, useValue: mockPrisma },
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
      (StripePayment.createOnboardingAccountLink as jest.Mock).mockResolvedValue({
        url: 'https://connect.stripe.com/onboard/acct_123',
      });

      const result = await service.createOnboardingLink('acct_connect_123');

      expect(result.success).toBe(true);
      expect(result.data.url).toBe('https://connect.stripe.com/onboard/acct_123');
      expect(StripePayment.createOnboardingAccountLink).toHaveBeenCalledWith(
        'acct_connect_123',
      );
    });

    it('should throw HttpException when Stripe onboarding call fails', async () => {
      (StripePayment.createOnboardingAccountLink as jest.Mock).mockRejectedValue(
        new Error('Stripe error'),
      );

      await expect(
        service.createOnboardingLink('acct_bad'),
      ).rejects.toThrow(HttpException);
    });
  });

  // ─── processWithdraw ──────────────────────────────────────────────────────

  describe('processWithdraw', () => {
    const withdrawDto = { amount: 100, currency: 'usd' };

    it('should process a successful withdrawal and record the transaction', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserWithConnect);
      (StripePayment.createTransfer as jest.Mock).mockResolvedValue({
        id: 'tr_transfer_001',
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.paymentTransaction.create.mockResolvedValue({});

      const result = await service.processWithdraw('user-1', withdrawDto);

      expect(result.success).toBe(true);
      expect(result.data?.transfer_id).toBe('tr_transfer_001');
      expect(result.data?.status).toBe('completed');
      expect(StripePayment.createTransfer).toHaveBeenCalledWith(
        mockUserWithConnect.stripe_connect_id,
        100,
        'usd',
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { balance: { decrement: 100 } },
        }),
      );
      expect(mockPrisma.paymentTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: 'user-1',
            type: 'withdraw',
            provider: 'stripe',
            status: 'completed',
            amount: 100,
          }),
        }),
      );
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

    it('should throw BadRequestException when amount is below minimum (< 2)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserWithConnect);

      await expect(
        service.processWithdraw('user-1', { amount: 1, currency: 'usd' }),
      ).rejects.toThrow(BadRequestException);
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

    it('should record a failed transaction and throw HttpException on Stripe transfer error', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserWithConnect);
      (StripePayment.createTransfer as jest.Mock).mockRejectedValue(
        new Error('Stripe transfer failed'),
      );
      mockPrisma.paymentTransaction.create.mockResolvedValue({});

      await expect(
        service.processWithdraw('user-1', withdrawDto),
      ).rejects.toThrow(HttpException);

      expect(mockPrisma.paymentTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: 'user-1',
            type: 'withdraw',
            status: 'failed',
          }),
        }),
      );
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
});
