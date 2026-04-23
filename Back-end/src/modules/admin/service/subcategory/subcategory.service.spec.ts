import { Test, TestingModule } from '@nestjs/testing';
import { SubcategoryService } from './subcategory.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('SubcategoryService', () => {
  let service: SubcategoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubcategoryService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<SubcategoryService>(SubcategoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
