import { Test, TestingModule } from '@nestjs/testing';
import { PaymentTransactionController } from './payment-transaction.controller';
import { PaymentTransactionService } from './payment-transaction.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';

describe('PaymentTransactionController', () => {
  let controller: PaymentTransactionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentTransactionController],
      providers: [
        {
          provide: PaymentTransactionService,
          useValue: {
            findAll: jest.fn(),
            findOne: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PaymentTransactionController>(
      PaymentTransactionController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
