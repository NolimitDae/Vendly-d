import { Test, TestingModule } from '@nestjs/testing';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

const mockContactService = {
  create: jest.fn(),
};

describe('ContactController', () => {
  let controller: ContactController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactController],
      providers: [
        { provide: ContactService, useValue: mockContactService },
      ],
    }).compile();

    controller = module.get<ContactController>(ContactController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should return the result from ContactService.create on success', async () => {
      const dto = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone_number: '555-0100',
        message: 'Test message',
      };
      const serviceResult = { success: true, message: 'Submitted successfully' };
      mockContactService.create.mockResolvedValue(serviceResult);

      const result = await controller.create(dto);

      expect(result).toEqual(serviceResult);
      expect(mockContactService.create).toHaveBeenCalledWith(dto);
    });

    it('should return error shape when ContactService.create throws', async () => {
      mockContactService.create.mockRejectedValue(new Error('Service error'));

      const result = await controller.create({ email: 'x@x.com' } as any);

      expect(result).toEqual({ success: false, message: 'Service error' });
    });

    it('should propagate a failure response from the service', async () => {
      mockContactService.create.mockResolvedValue({
        success: false,
        message: 'DB error',
      });

      const result = await controller.create({ email: 'fail@test.com' } as any);

      expect(result.success).toBe(false);
    });
  });
});
