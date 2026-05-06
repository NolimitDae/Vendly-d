import { Test, TestingModule } from '@nestjs/testing';
import { ContactService } from './contact.service';
import { PrismaService } from '../../../prisma/prisma.service';

jest.mock('../../../common/helper/date.helper', () => ({
  DateHelper: {
    now: jest.fn(() => new Date('2024-01-01T00:00:00Z')),
  },
}));

const mockContact = {
  id: 'contact-1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@test.com',
  phone_number: '+1234567890',
  message: 'Hello there',
};

const mockPrisma = {
  contact: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
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
      mockPrisma.contact.create.mockResolvedValue(mockContact);

      const result = await service.create({
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@test.com',
        phone_number: '+1234567890',
        message: 'Hello there',
      });

      expect(mockPrisma.contact.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ first_name: 'John', email: 'john@test.com' }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Contact created successfully');
    });

    it('should return failure response when prisma throws', async () => {
      mockPrisma.contact.create.mockRejectedValue(new Error('DB error'));

      const result = await service.create({ email: 'bad@test.com' } as any);

      expect(result.success).toBe(false);
      expect(result.message).toBe('DB error');
    });
  });

  describe('findAll', () => {
    it('should return all contacts with success flag', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([mockContact]);

      const result = await service.findAll({});

      expect(mockPrisma.contact.findMany).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].email).toBe('john@test.com');
    });

    it('should return empty data array when no contacts exist', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([]);

      const result = await service.findAll({ q: 'nonexistent' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should return failure response when prisma throws', async () => {
      mockPrisma.contact.findMany.mockRejectedValue(new Error('Query failed'));

      const result = await service.findAll({});

      expect(result.success).toBe(false);
      expect(result.message).toBe('Query failed');
    });
  });

  describe('findOne', () => {
    it('should return a single contact by id', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue(mockContact);

      const result = await service.findOne('contact-1');

      expect(mockPrisma.contact.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'contact-1' } }),
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockContact);
    });

    it('should return failure response when prisma throws', async () => {
      mockPrisma.contact.findUnique.mockRejectedValue(new Error('Not accessible'));

      const result = await service.findOne('bad-id');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Not accessible');
    });
  });

  describe('update', () => {
    it('should update contact fields and return success', async () => {
      mockPrisma.contact.update.mockResolvedValue({ ...mockContact, first_name: 'Jane' });

      const result = await service.update('contact-1', { first_name: 'Jane' } as any);

      expect(mockPrisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'contact-1' },
          data: expect.objectContaining({ first_name: 'Jane' }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Contact updated successfully');
    });

    it('should return failure response when update throws', async () => {
      mockPrisma.contact.update.mockRejectedValue(new Error('Update failed'));

      const result = await service.update('bad-id', {} as any);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Update failed');
    });
  });

  describe('remove', () => {
    it('should delete a contact and return success', async () => {
      mockPrisma.contact.delete.mockResolvedValue(mockContact);

      const result = await service.remove('contact-1');

      expect(mockPrisma.contact.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'contact-1' } }),
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Contact deleted successfully');
    });

    it('should return failure response when delete throws', async () => {
      mockPrisma.contact.delete.mockRejectedValue(new Error('Delete failed'));

      const result = await service.remove('bad-id');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Delete failed');
    });
  });
});
