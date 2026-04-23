import { Test, TestingModule } from '@nestjs/testing';
import { DepositeController } from './deposite.controller';
import { DepositeService } from './deposite.service';

describe('DepositeController', () => {
  let controller: DepositeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DepositeController],
      providers: [DepositeService],
    }).compile();

    controller = module.get<DepositeController>(DepositeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
