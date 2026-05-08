import { Test, TestingModule } from '@nestjs/testing';
import { WithdrawController } from './withdraw.controller';
import { WithdrawService } from './withdraw.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CreateWithdrawDto } from './dto/create-withdraw.dto';

const mockWithdrawService = {
  createConnectedAccount: jest.fn(),
  createOnboardingLink: jest.fn(),
  processWithdraw: jest.fn(),
  checkAccountBalance: jest.fn(),
  getWithdrawHistory: jest.fn(),
  getConnectedAccountInfo: jest.fn(),
};

const mockConnectedAccountResult = {
  success: true,
  message: 'Connected account created successfully',
  data: { accountId: 'acct_new_456' },
};

const mockOnboardingResult = {
  success: true,
  message: 'Onboarding link created successfully',
  data: { url: 'https://connect.stripe.com/onboard/acct_123' },
};

const mockWithdrawResult = {
  success: true,
  message: 'Withdraw processed successfully',
  data: {
    transfer_id: 'tr_transfer_001',
    amount: 100,
    currency: 'usd',
    status: 'completed',
  },
};

const mockBalanceResult = {
  success: true,
  data: {
    available: { amount: 50, amount_in_cents: 5000, currency: 'usd', display: '$50.00 USD' },
    pending: { amount: 10, amount_in_cents: 1000, currency: 'usd', display: '$10.00 USD' },
    total: { amount: 60, display: '$60.00 USD' },
  },
};

const mockHistoryResult = {
  success: true,
  data: [
    { id: 'txn-1', type: 'withdraw', amount: 100, status: 'completed' },
  ],
};

const mockAccountInfoResult = {
  success: true,
  message: 'Connected account info retrieved successfully',
  data: {
    hasConnectedAccount: true,
    accountId: 'acct_connect_123',
    email: 'jane@test.com',
    name: 'Jane Doe',
  },
};

describe('WithdrawController', () => {
  let controller: WithdrawController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WithdrawController],
      providers: [
        { provide: WithdrawService, useValue: mockWithdrawService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WithdrawController>(WithdrawController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── createConnectedAccount ───────────────────────────────────────────────

  describe('createConnectedAccount (POST /withdraw/create-connected-account)', () => {
    it('should call service with userId and email extracted from req.user', async () => {
      mockWithdrawService.createConnectedAccount.mockResolvedValue(
        mockConnectedAccountResult,
      );

      const req = { user: { userId: 'user-1', email: 'jane@test.com' } };
      const result = await controller.createConnectedAccount(req);

      expect(result).toEqual(
        expect.objectContaining({ success: true, message: expect.any(String) }),
      );
      expect(mockWithdrawService.createConnectedAccount).toHaveBeenCalledWith(
        'user-1',
        'jane@test.com',
      );
      expect(mockWithdrawService.createConnectedAccount).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors thrown by the service', async () => {
      mockWithdrawService.createConnectedAccount.mockRejectedValue(
        new Error('Already has account'),
      );

      const req = { user: { userId: 'user-1', email: 'jane@test.com' } };

      await expect(controller.createConnectedAccount(req)).rejects.toThrow(
        'Already has account',
      );
    });
  });

  // ─── getOnboardingLink ────────────────────────────────────────────────────

  describe('getOnboardingLink (POST /withdraw/onboarding/:accountId)', () => {
    it('should delegate to service and wrap result in success envelope', async () => {
      mockWithdrawService.createOnboardingLink.mockResolvedValue(
        mockOnboardingResult,
      );

      const result = await controller.getOnboardingLink('acct_connect_123');

      expect(result).toEqual(
        expect.objectContaining({ success: true, message: expect.any(String) }),
      );
      expect(mockWithdrawService.createOnboardingLink).toHaveBeenCalledWith(
        'acct_connect_123',
      );
    });

    it('should propagate errors thrown by the service', async () => {
      mockWithdrawService.createOnboardingLink.mockRejectedValue(
        new Error('Stripe failed'),
      );

      await expect(
        controller.getOnboardingLink('acct_bad'),
      ).rejects.toThrow('Stripe failed');
    });
  });

  // ─── requestWithdraw ──────────────────────────────────────────────────────

  describe('requestWithdraw (POST /withdraw/request)', () => {
    it('should call processWithdraw with userId and dto from the request', async () => {
      mockWithdrawService.processWithdraw.mockResolvedValue(mockWithdrawResult);

      const dto: CreateWithdrawDto = { amount: 100, currency: 'usd' };
      const req = { user: { userId: 'user-1' } };

      const result = await controller.requestWithdraw(req, dto);

      expect(result).toEqual(mockWithdrawResult);
      expect(mockWithdrawService.processWithdraw).toHaveBeenCalledWith(
        'user-1',
        dto,
      );
      expect(mockWithdrawService.processWithdraw).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors thrown by the service', async () => {
      mockWithdrawService.processWithdraw.mockRejectedValue(
        new Error('Insufficient balance'),
      );

      const dto: CreateWithdrawDto = { amount: 9999 };
      const req = { user: { userId: 'user-1' } };

      await expect(controller.requestWithdraw(req, dto)).rejects.toThrow(
        'Insufficient balance',
      );
    });
  });

  // ─── checkBalance ─────────────────────────────────────────────────────────

  describe('checkBalance (GET /withdraw/balance)', () => {
    it('should return balance info using userId from req.user', async () => {
      mockWithdrawService.checkAccountBalance.mockResolvedValue(mockBalanceResult);

      const req = { user: { userId: 'user-1' } };
      const result = await controller.checkBalance(req);

      expect(result).toEqual(mockBalanceResult);
      expect(mockWithdrawService.checkAccountBalance).toHaveBeenCalledWith('user-1');
      expect(mockWithdrawService.checkAccountBalance).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors thrown by the service', async () => {
      mockWithdrawService.checkAccountBalance.mockRejectedValue(
        new Error('No connected account found'),
      );

      const req = { user: { userId: 'user-1' } };

      await expect(controller.checkBalance(req)).rejects.toThrow(
        'No connected account found',
      );
    });
  });

  // ─── getWithdrawHistory ───────────────────────────────────────────────────

  describe('getWithdrawHistory (GET /withdraw/history)', () => {
    it('should return the list of withdraw transactions for the authenticated user', async () => {
      mockWithdrawService.getWithdrawHistory.mockResolvedValue(mockHistoryResult);

      const req = { user: { userId: 'user-1' } };
      const result = await controller.getWithdrawHistory(req);

      expect(result).toEqual(mockHistoryResult);
      expect(mockWithdrawService.getWithdrawHistory).toHaveBeenCalledWith('user-1');
    });

    it('should propagate errors thrown by the service', async () => {
      mockWithdrawService.getWithdrawHistory.mockRejectedValue(
        new Error('DB error'),
      );

      const req = { user: { userId: 'user-1' } };

      await expect(controller.getWithdrawHistory(req)).rejects.toThrow('DB error');
    });
  });

  // ─── getAccountInfo ───────────────────────────────────────────────────────

  describe('getAccountInfo (GET /withdraw/account-info)', () => {
    it('should return connected account info for the authenticated user', async () => {
      mockWithdrawService.getConnectedAccountInfo.mockResolvedValue(
        mockAccountInfoResult,
      );

      const req = { user: { userId: 'user-1' } };
      const result = await controller.getAccountInfo(req);

      expect(result).toEqual(mockAccountInfoResult);
      expect(mockWithdrawService.getConnectedAccountInfo).toHaveBeenCalledWith(
        'user-1',
      );
      expect(mockWithdrawService.getConnectedAccountInfo).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors thrown by the service', async () => {
      mockWithdrawService.getConnectedAccountInfo.mockRejectedValue(
        new Error('User not found'),
      );

      const req = { user: { userId: 'ghost-user' } };

      await expect(controller.getAccountInfo(req)).rejects.toThrow(
        'User not found',
      );
    });
  });
});
