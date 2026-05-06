import { Test, TestingModule } from '@nestjs/testing';
import { FaqController } from './faq.controller';
import { FaqService } from './faq.service';

const mockFaqService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
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
    }).compile();

    controller = module.get<FaqController>(FaqController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all FAQs from the service', async () => {
      const serviceResult = {
        success: true,
        data: [
          { id: 'faq-1', question: 'Q1', answer: 'A1' },
          { id: 'faq-2', question: 'Q2', answer: 'A2' },
        ],
      };
      mockFaqService.findAll.mockResolvedValue(serviceResult);

      const result = await controller.findAll();

      expect(result).toEqual(serviceResult);
      expect(mockFaqService.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return error shape when FaqService.findAll throws', async () => {
      mockFaqService.findAll.mockRejectedValue(new Error('Service error'));

      const result = await controller.findAll();

      expect(result).toEqual({ success: false, message: 'Service error' });
    });
  });

  describe('findOne', () => {
    it('should return a single FAQ by id from the service', async () => {
      const serviceResult = {
        success: true,
        data: { id: 'faq-1', question: 'Q1', answer: 'A1' },
      };
      mockFaqService.findOne.mockResolvedValue(serviceResult);

      const result = await controller.findOne('faq-1');

      expect(result).toEqual(serviceResult);
      expect(mockFaqService.findOne).toHaveBeenCalledWith('faq-1');
    });

    it('should return error shape when FaqService.findOne throws', async () => {
      mockFaqService.findOne.mockRejectedValue(new Error('Not found error'));

      const result = await controller.findOne('bad-id');

      expect(result).toEqual({ success: false, message: 'Not found error' });
    });
  });
});
