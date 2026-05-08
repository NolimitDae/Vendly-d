import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoryService } from './category.service';
import { PrismaService } from 'src/prisma/prisma.service';

const mockCategory = {
  id: 'cat-1',
  name: 'Plumbing',
  created_at: new Date(),
  updated_at: new Date(),
};

const mockPrisma = {
  serviceCategory: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('CategoryService', () => {
  let service: CategoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CategoryService>(CategoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create and return a new category', async () => {
      mockPrisma.serviceCategory.findUnique.mockResolvedValue(null);
      mockPrisma.serviceCategory.create.mockResolvedValue(mockCategory);

      const result = await service.create({ name: 'Plumbing' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockCategory);
      expect(mockPrisma.serviceCategory.create).toHaveBeenCalledWith({ data: { name: 'Plumbing' } });
    });

    it('should throw ConflictException when category name already exists', async () => {
      mockPrisma.serviceCategory.findUnique.mockResolvedValue(mockCategory);

      await expect(service.create({ name: 'Plumbing' })).rejects.toThrow(ConflictException);
      expect(mockPrisma.serviceCategory.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all categories', async () => {
      mockPrisma.serviceCategory.findMany.mockResolvedValue([mockCategory]);

      const result = await service.findAll();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(mockPrisma.serviceCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      );
    });

    it('should return an empty list when no categories exist', async () => {
      mockPrisma.serviceCategory.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('findOne', () => {
    it('should return a category by id', async () => {
      mockPrisma.serviceCategory.findUnique.mockResolvedValue(mockCategory);

      const result = await service.findOne('cat-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockCategory);
      expect(mockPrisma.serviceCategory.findUnique).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
    });

    it('should throw NotFoundException when category is not found', async () => {
      mockPrisma.serviceCategory.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a category name successfully', async () => {
      const updated = { ...mockCategory, name: 'Electrical' };
      mockPrisma.serviceCategory.findUnique
        .mockResolvedValueOnce(mockCategory) // existing category lookup
        .mockResolvedValueOnce(null);         // conflict check
      mockPrisma.serviceCategory.update.mockResolvedValue(updated);

      const result = await service.update('cat-1', { name: 'Electrical' });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Electrical');
    });

    it('should throw NotFoundException when the category to update does not exist', async () => {
      mockPrisma.serviceCategory.findUnique.mockResolvedValueOnce(null);

      await expect(service.update('bad-id', { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when another category has the same name', async () => {
      const otherCategory = { id: 'cat-99', name: 'Electrical' };
      mockPrisma.serviceCategory.findUnique
        .mockResolvedValueOnce(mockCategory)   // original category
        .mockResolvedValueOnce(otherCategory); // conflict

      await expect(service.update('cat-1', { name: 'Electrical' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a category and return success', async () => {
      mockPrisma.serviceCategory.findUnique.mockResolvedValue(mockCategory);
      mockPrisma.serviceCategory.delete.mockResolvedValue(mockCategory);

      const result = await service.remove('cat-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.serviceCategory.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
    });

    it('should throw NotFoundException when the category to delete does not exist', async () => {
      mockPrisma.serviceCategory.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
