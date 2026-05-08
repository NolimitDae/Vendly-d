import { Test, TestingModule } from '@nestjs/testing';
import { FaqService } from './faq.service';
import { PrismaService } from '../../../prisma/prisma.service';

jest.mock('../../../common/helper/date.helper', () => ({
  DateHelper: {
    now: jest.fn(() => new Date('2024-01-01T00:00:00Z')),
  },
}));

const mockFaq = {
  id: 'faq-1',
  question: 'What is Vendly?',
  answer: 'A marketplace platform.',
  sort_order: 1,
};

const mockPrisma = {
  faq: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
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

  describe('create', () => {
    it('should create a faq and return success', async () => {
      mockPrisma.faq.create.mockResolvedValue(mockFaq);

      const result = await service.create({
        question: 'What is Vendly?',
        answer: 'A marketplace platform.',
        sort_order: 1,
      });

      expect(mockPrisma.faq.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            question: 'What is Vendly?',
            answer: 'A marketplace platform.',
            sort_order: 1,
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Faq created successfully');
    });

    it('should return failure response when prisma throws', async () => {
      mockPrisma.faq.create.mockRejectedValue(new Error('DB error'));

      const result = await service.create({ question: 'Q?' } as any);

      expect(result.success).toBe(false);
      expect(result.message).toBe('DB error');
    });
  });

  describe('findAll', () => {
    it('should return all faqs ordered by sort_order', async () => {
      mockPrisma.faq.findMany.mockResolvedValue([mockFaq]);

      const result = await service.findAll();

      expect(mockPrisma.faq.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { sort_order: 'asc' } }),
      );
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].question).toBe('What is Vendly?');
    });

    it('should return empty data array when no faqs exist', async () => {
      mockPrisma.faq.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should return failure response when prisma throws', async () => {
      mockPrisma.faq.findMany.mockRejectedValue(new Error('Query failed'));

      const result = await service.findAll();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Query failed');
    });
  });

  describe('findOne', () => {
    it('should return a single faq by id', async () => {
      mockPrisma.faq.findUnique.mockResolvedValue(mockFaq);

      const result = await service.findOne('faq-1');

      expect(mockPrisma.faq.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'faq-1' } }),
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockFaq);
    });

    it('should return failure response when prisma throws', async () => {
      mockPrisma.faq.findUnique.mockRejectedValue(new Error('Not found'));

      const result = await service.findOne('bad-id');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Not found');
    });
  });

  describe('batchCreate', () => {
    it('should update existing faqs and create new ones, returning success', async () => {
      const oldFaqs = [{ id: 'faq-old', question: 'Old Q', answer: 'Old A', sort_order: 1 }];
      mockPrisma.faq.findMany.mockResolvedValue(oldFaqs);
      mockPrisma.faq.delete.mockResolvedValue(oldFaqs[0]);
      mockPrisma.faq.create.mockResolvedValue(mockFaq);

      const result = await service.batchCreate({
        faqs: [{ question: 'What is Vendly?', answer: 'A marketplace.', sort_order: 1 }],
      });

      expect(mockPrisma.faq.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'faq-old' } }),
      );
      expect(mockPrisma.faq.create).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Faqs updated successfully');
    });

    it('should update faq when existing id is provided in batch', async () => {
      mockPrisma.faq.findMany.mockResolvedValue([mockFaq]);
      mockPrisma.faq.update.mockResolvedValue({ ...mockFaq, question: 'Updated Q?' });

      const result = await service.batchCreate({
        faqs: [{ id: 'faq-1', question: 'Updated Q?', answer: 'New A', sort_order: 1 }],
      });

      expect(mockPrisma.faq.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'faq-1' } }),
      );
      expect(result.success).toBe(true);
    });

    it('should return failure response when prisma throws', async () => {
      mockPrisma.faq.findMany.mockRejectedValue(new Error('Batch failed'));

      const result = await service.batchCreate({ faqs: [] });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Batch failed');
    });
  });

  describe('update', () => {
    it('should update a faq and return success', async () => {
      mockPrisma.faq.update.mockResolvedValue({ ...mockFaq, question: 'Updated Q?' });

      const result = await service.update('faq-1', { question: 'Updated Q?' });

      expect(mockPrisma.faq.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'faq-1' },
          data: expect.objectContaining({ question: 'Updated Q?' }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Faq updated successfully');
    });

    it('should return failure response when update throws', async () => {
      mockPrisma.faq.update.mockRejectedValue(new Error('Update failed'));

      const result = await service.update('bad-id', { question: 'Q?' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Update failed');
    });
  });

  describe('remove', () => {
    it('should delete a faq and return success', async () => {
      mockPrisma.faq.delete.mockResolvedValue(mockFaq);

      const result = await service.remove('faq-1');

      expect(mockPrisma.faq.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'faq-1' } }),
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Faq deleted successfully');
    });

    it('should return failure response when delete throws', async () => {
      mockPrisma.faq.delete.mockRejectedValue(new Error('Delete failed'));

      const result = await service.remove('bad-id');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Delete failed');
    });
  });
});
