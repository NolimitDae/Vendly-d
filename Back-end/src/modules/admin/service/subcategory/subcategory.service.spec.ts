import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SubcategoryService } from './subcategory.service';
import { PrismaService } from 'src/prisma/prisma.service';

const mockCategory = {
  id: 'cat-1',
  name: 'Plumbing',
};

const mockSubcategory = {
  id: 'sub-1',
  name: 'Pipe Repair',
  category_id: 'cat-1',
  category: mockCategory,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockPrisma = {
  serviceCategory: {
    findUnique: jest.fn(),
  },
  serviceSubCategory: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('SubcategoryService', () => {
  let service: SubcategoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubcategoryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SubcategoryService>(SubcategoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create and return a new subcategory', async () => {
      mockPrisma.serviceCategory.findUnique.mockResolvedValue(mockCategory);
      mockPrisma.serviceSubCategory.findUnique.mockResolvedValue(null);
      mockPrisma.serviceSubCategory.create.mockResolvedValue(mockSubcategory);

      const result = await service.create({ name: 'Pipe Repair', category_id: 'cat-1' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockSubcategory);
      expect(mockPrisma.serviceSubCategory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: 'Pipe Repair', category_id: 'cat-1' },
        }),
      );
    });

    it('should throw NotFoundException when the parent category does not exist', async () => {
      mockPrisma.serviceCategory.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ name: 'Pipe Repair', category_id: 'bad-cat' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.serviceSubCategory.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when subcategory name already exists in the same category', async () => {
      mockPrisma.serviceCategory.findUnique.mockResolvedValue(mockCategory);
      mockPrisma.serviceSubCategory.findUnique.mockResolvedValue(mockSubcategory);

      await expect(
        service.create({ name: 'Pipe Repair', category_id: 'cat-1' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return all subcategories with their parent category', async () => {
      mockPrisma.serviceSubCategory.findMany.mockResolvedValue([mockSubcategory]);

      const result = await service.findAll();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(mockPrisma.serviceSubCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { created_at: 'desc' } }),
      );
    });

    it('should return an empty list when no subcategories exist', async () => {
      mockPrisma.serviceSubCategory.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('findOne', () => {
    it('should return a subcategory by id', async () => {
      mockPrisma.serviceSubCategory.findUnique.mockResolvedValue(mockSubcategory);

      const result = await service.findOne('sub-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockSubcategory);
      expect(mockPrisma.serviceSubCategory.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sub-1' } }),
      );
    });

    it('should throw NotFoundException when subcategory is not found', async () => {
      mockPrisma.serviceSubCategory.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update the subcategory name successfully', async () => {
      const updated = { ...mockSubcategory, name: 'Drain Cleaning' };
      // First call: fetch existing subcategory; second call: conflict check returns null
      mockPrisma.serviceSubCategory.findUnique
        .mockResolvedValueOnce(mockSubcategory)
        .mockResolvedValueOnce(null);
      mockPrisma.serviceSubCategory.update.mockResolvedValue(updated);

      const result = await service.update('sub-1', { name: 'Drain Cleaning' });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Drain Cleaning');
    });

    it('should throw NotFoundException when the subcategory to update does not exist', async () => {
      mockPrisma.serviceSubCategory.findUnique.mockResolvedValueOnce(null);

      await expect(service.update('ghost', { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when another subcategory has the same name in the same category', async () => {
      const other = { id: 'sub-99', name: 'Drain Cleaning', category_id: 'cat-1' };
      mockPrisma.serviceSubCategory.findUnique
        .mockResolvedValueOnce(mockSubcategory) // existing subcategory
        .mockResolvedValueOnce(other);           // conflict check
      mockPrisma.serviceCategory.findUnique.mockResolvedValue(null); // no category change

      await expect(service.update('sub-1', { name: 'Drain Cleaning' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException when the new category_id does not exist', async () => {
      mockPrisma.serviceSubCategory.findUnique.mockResolvedValueOnce(mockSubcategory);
      mockPrisma.serviceCategory.findUnique.mockResolvedValue(null);

      await expect(
        service.update('sub-1', { category_id: 'nonexistent-cat' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a subcategory and return success', async () => {
      mockPrisma.serviceSubCategory.findUnique.mockResolvedValue(mockSubcategory);
      mockPrisma.serviceSubCategory.delete.mockResolvedValue(mockSubcategory);

      const result = await service.remove('sub-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.serviceSubCategory.delete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
    });

    it('should throw NotFoundException when the subcategory to delete does not exist', async () => {
      mockPrisma.serviceSubCategory.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
