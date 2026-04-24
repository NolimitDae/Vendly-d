import { Test, TestingModule } from '@nestjs/testing';
import { PaymentTransactionService } from './payment-transaction.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserRepository } from 'src/common/repository/user/user.repository';

describe('PaymentTransactionService', () => {
  let service: PaymentTransactionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentTransactionService,
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: UserRepository,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<PaymentTransactionService>(PaymentTransactionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
