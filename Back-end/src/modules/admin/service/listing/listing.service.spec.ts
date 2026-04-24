import { Test, TestingModule } from '@nestjs/testing';
import { ListingService } from './listing.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('ListingService', () => {
  let service: ListingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListingService,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    service = module.get<ListingService>(ListingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
