import { Test, TestingModule } from '@nestjs/testing';
import { FaqController } from './faq.controller';
import { FaqService } from './faq.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';

const mockFaqService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  batchCreate: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

const mockFaq = {
  id: 'faq-1',
  question: 'What is Vendly?',
  answer: 'A marketplace platform.',
  sort_order: 1,
};

describe('FaqController', () => {
  let controller: FaqController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FaqController],
      providers: [
        { provide: FaqService, useValue: mockFaqService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FaqController>(FaqController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call service.create with dto and return result', async () => {
      const dto = { question: 'What is Vendly?', answer: 'A platform.', sort_order: 1 };
      const expected = { success: true, message: 'Faq created successfully' };
      mockFaqService.create.mockResolvedValue(expected);

      const result = await controller.create(dto as any);

      expect(mockFaqService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });

    it('should return error object when service throws', async () => {
      mockFaqService.create.mockRejectedValue(new Error('DB error'));

      const result = await controller.create({} as any);

      expect(result).toEqual({ success: false, message: 'DB error' });
    });
  });

  describe('batchCreate', () => {
    it('should call service.batchCreate with dto and return result', async () => {
      const dto = { faqs: [{ question: 'Q?', answer: 'A.', sort_order: 1 }] };
      const expected = { success: true, message: 'Faqs updated successfully' };
      mockFaqService.batchCreate.mockResolvedValue(expected);

      const result = await controller.batchCreate(dto as any);

      expect(mockFaqService.batchCreate).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });

    it('should return error object when service throws', async () => {
      mockFaqService.batchCreate.mockRejectedValue(new Error('Batch failed'));

      const result = await controller.batchCreate({ faqs: [] });

      expect(result).toEqual({ success: false, message: 'Batch failed' });
    });
  });

  describe('findAll', () => {
    it('should return all faqs from service', async () => {
      const expected = { success: true, data: [mockFaq] };
      mockFaqService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll();

      expect(mockFaqService.findAll).toHaveBeenCalled();
      expect(result).toEqual(expected);
    });

    it('should return error object when service throws', async () => {
      mockFaqService.findAll.mockRejectedValue(new Error('Query failed'));

      const result = await controller.findAll();

      expect(result).toEqual({ success: false, message: 'Query failed' });
    });
  });

  describe('findOne', () => {
    it('should call service.findOne with id and return faq', async () => {
      const expected = { success: true, data: mockFaq };
      mockFaqService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('faq-1');

      expect(mockFaqService.findOne).toHaveBeenCalledWith('faq-1');
      expect(result).toEqual(expected);
    });

    it('should return error object when service throws', async () => {
      mockFaqService.findOne.mockRejectedValue(new Error('Not found'));

      const result = await controller.findOne('bad-id');

      expect(result).toEqual({ success: false, message: 'Not found' });
    });
  });

  describe('update', () => {
    it('should call service.update with id and dto and return result', async () => {
      const dto = { question: 'Updated Q?' };
      const expected = { success: true, message: 'Faq updated successfully' };
      mockFaqService.update.mockResolvedValue(expected);

      const result = await controller.update('faq-1', dto as any);

      expect(mockFaqService.update).toHaveBeenCalledWith('faq-1', dto);
      expect(result).toEqual(expected);
    });

    it('should return error object when service throws', async () => {
      mockFaqService.update.mockRejectedValue(new Error('Update failed'));

      const result = await controller.update('bad-id', {} as any);

      expect(result).toEqual({ success: false, message: 'Update failed' });
    });
  });

  describe('remove', () => {
    it('should call service.remove with id and return result', async () => {
      const expected = { success: true, message: 'Faq deleted successfully' };
      mockFaqService.remove.mockResolvedValue(expected);

      const result = await controller.remove('faq-1');

      expect(mockFaqService.remove).toHaveBeenCalledWith('faq-1');
      expect(result).toEqual(expected);
    });

    it('should return error object when service throws', async () => {
      mockFaqService.remove.mockRejectedValue(new Error('Delete failed'));

      const result = await controller.remove('bad-id');

      expect(result).toEqual({ success: false, message: 'Delete failed' });
    });
  });
});
