import { Test, TestingModule } from '@nestjs/testing';
import { DepositeService } from './deposite.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('DepositeService', () => {
  let service: DepositeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepositeService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<DepositeService>(DepositeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
