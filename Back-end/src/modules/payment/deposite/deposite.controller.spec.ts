import { Test, TestingModule } from '@nestjs/testing';
import { DepositeController } from './deposite.controller';
import { DepositeService } from './deposite.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

describe('DepositeController', () => {
  let controller: DepositeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DepositeController],
      providers: [
        {
          provide: DepositeService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
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
});
