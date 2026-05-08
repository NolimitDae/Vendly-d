import { Test, TestingModule } from '@nestjs/testing';
import { ContactService } from './contact.service';
import { PrismaService } from 'src/prisma/prisma.service';

const mockPrisma = {
  contact: {
    create: jest.fn(),
  },
};

describe('ContactService', () => {
  let service: ContactService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ContactService>(ContactService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a contact and return success', async () => {
      mockPrisma.contact.create.mockResolvedValue({ id: 'contact-1' });

      const dto = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone_number: '1234567890',
        message: 'Hello there',
      };

      const result = await service.create(dto);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Submitted successfully');
      expect(mockPrisma.contact.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            first_name: 'John',
            email: 'john@example.com',
          }),
        }),
      );
    });

    it('should return success false when prisma throws', async () => {
      mockPrisma.contact.create.mockRejectedValue(new Error('DB error'));

      const result = await service.create({
        first_name: 'Jane',
        email: 'jane@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('DB error');
    });

    it('should only include provided fields in the data object', async () => {
      mockPrisma.contact.create.mockResolvedValue({ id: 'contact-2' });

      const dto = { email: 'partial@example.com' };
      await service.create(dto);

      expect(mockPrisma.contact.create).toHaveBeenCalledWith({
        data: { email: 'partial@example.com' },
      });
    });
  });
});
