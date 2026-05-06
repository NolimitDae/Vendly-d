import { Test, TestingModule } from '@nestjs/testing';
import { DepositeController } from './deposite.controller';
import { DepositeService } from './deposite.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CreateDepositDto } from './dto/create-deposite.dto';

const mockDepositeService = {
  create: jest.fn(),
};

const mockDepositResult = {
  success: true,
  message: 'Deposit intent created successfully',
  data: {
    payment_intent_id: 'pi_abc123',
    client_secret: 'pi_abc123_secret',
    amount: 100,
    currency: 'usd',
  },
};

describe('DepositeController', () => {
  let controller: DepositeController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DepositeController],
      providers: [
        { provide: DepositeService, useValue: mockDepositeService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DepositeController>(DepositeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create (POST /deposite/add-balance)', () => {
    it('should call depositeService.create with dto and userId from request', async () => {
      mockDepositeService.create.mockResolvedValue(mockDepositResult);

      const dto: CreateDepositDto = { amount: 100, currency: 'usd' };
      const req = { user: { userId: 'user-1' } };

      const result = await controller.create(dto, req);

      expect(result).toEqual(mockDepositResult);
      expect(mockDepositeService.create).toHaveBeenCalledWith(dto, 'user-1');
      expect(mockDepositeService.create).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors thrown by the service', async () => {
      mockDepositeService.create.mockRejectedValue(
        new Error('Service error'),
      );

      const dto: CreateDepositDto = { amount: -10 };
      const req = { user: { userId: 'user-1' } };

      await expect(controller.create(dto, req)).rejects.toThrow('Service error');
      expect(mockDepositeService.create).toHaveBeenCalledWith(dto, 'user-1');
    });

    it('should extract userId correctly from nested req.user object', async () => {
      mockDepositeService.create.mockResolvedValue(mockDepositResult);

      const dto: CreateDepositDto = { amount: 200, currency: 'eur' };
      const req = { user: { userId: 'user-42', email: 'test@test.com' } };

      await controller.create(dto, req);

      expect(mockDepositeService.create).toHaveBeenCalledWith(dto, 'user-42');
    });
  });
});
