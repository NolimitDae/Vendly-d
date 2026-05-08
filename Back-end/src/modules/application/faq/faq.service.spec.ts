import { Test, TestingModule } from '@nestjs/testing';
import { FaqService } from './faq.service';
import { PrismaService } from 'src/prisma/prisma.service';

const mockFaqs = [
  { id: 'faq-1', question: 'What is Vendly?', answer: 'A marketplace.' },
  { id: 'faq-2', question: 'How do I sign up?', answer: 'Click register.' },
];

const mockPrisma = {
  faq: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
};

describe('FaqService', () => {
  let service: FaqService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaqService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FaqService>(FaqService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all FAQs ordered by sort_order', async () => {
      mockPrisma.faq.findMany.mockResolvedValue(mockFaqs);

      const result = await service.findAll();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(mockPrisma.faq.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { sort_order: 'asc' } }),
      );
    });

    it('should return success false when prisma throws', async () => {
      mockPrisma.faq.findMany.mockRejectedValue(new Error('DB error'));

      const result = await service.findAll();

      expect(result.success).toBe(false);
      expect(result['message']).toBe('DB error');
    });
  });

  describe('findOne', () => {
    it('should return a single FAQ by id', async () => {
      mockPrisma.faq.findUnique.mockResolvedValue(mockFaqs[0]);

      const result = await service.findOne('faq-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockFaqs[0]);
      expect(mockPrisma.faq.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'faq-1' } }),
      );
    });

    it('should return success true with null data when FAQ does not exist', async () => {
      mockPrisma.faq.findUnique.mockResolvedValue(null);

      const result = await service.findOne('nonexistent');

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should return success false when prisma throws', async () => {
      mockPrisma.faq.findUnique.mockRejectedValue(new Error('DB error'));

      const result = await service.findOne('faq-1');

      expect(result.success).toBe(false);
    });
  });
});
