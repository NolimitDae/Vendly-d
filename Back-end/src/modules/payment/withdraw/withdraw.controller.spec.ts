import { Test, TestingModule } from '@nestjs/testing';
import { WithdrawController } from './withdraw.controller';
import { WithdrawService } from './withdraw.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

describe('WithdrawController', () => {
  let controller: WithdrawController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WithdrawController],
      providers: [
        {
          provide: WithdrawService,
          useValue: {
            createConnectedAccount: jest.fn(),
            createOnboardingLink: jest.fn(),
            processWithdraw: jest.fn(),
            checkAccountBalance: jest.fn(),
            getWithdrawHistory: jest.fn(),
            getConnectedAccountInfo: jest.fn(),
          },
        },
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
});
