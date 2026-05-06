import { Test, TestingModule } from '@nestjs/testing';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';

const mockCategory = {
  id: 'cat-1',
  name: 'Plumbing',
  created_at: new Date(),
  updated_at: new Date(),
};

const mockCategoryService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('CategoryController', () => {
  let controller: CategoryController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoryController],
      providers: [
        { provide: CategoryService, useValue: mockCategoryService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CategoryController>(CategoryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should return the newly created category from the service', async () => {
      const serviceResult = {
        success: true,
        message: 'Category created successfully',
        data: mockCategory,
      };
      mockCategoryService.create.mockResolvedValue(serviceResult);

      const result = await controller.create({ name: 'Plumbing' });

      expect(result).toEqual(serviceResult);
      expect(mockCategoryService.create).toHaveBeenCalledWith({ name: 'Plumbing' });
    });

    it('should propagate the service response when creation fails', async () => {
      mockCategoryService.create.mockRejectedValue(new Error('Conflict'));

      await expect(controller.create({ name: 'Plumbing' })).rejects.toThrow('Conflict');
    });
  });

  describe('findAll', () => {
    it('should return all categories from the service', async () => {
      const serviceResult = {
        success: true,
        message: 'Categories retrieved successfully',
        data: [mockCategory],
      };
      mockCategoryService.findAll.mockResolvedValue(serviceResult);

      const result = await controller.findAll();

      expect(result).toEqual(serviceResult);
      expect(mockCategoryService.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return an empty data array when no categories exist', async () => {
      const serviceResult = {
        success: true,
        message: 'Categories retrieved successfully',
        data: [],
      };
      mockCategoryService.findAll.mockResolvedValue(serviceResult);

      const result = await controller.findAll();

      expect(result.data).toHaveLength(0);
    });
  });

  describe('findOne', () => {
    it('should return a single category by id', async () => {
      const serviceResult = {
        success: true,
        message: 'Category retrieved successfully',
        data: mockCategory,
      };
      mockCategoryService.findOne.mockResolvedValue(serviceResult);

      const result = await controller.findOne('cat-1');

      expect(result).toEqual(serviceResult);
      expect(mockCategoryService.findOne).toHaveBeenCalledWith('cat-1');
    });

    it('should propagate NotFoundException from the service', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockCategoryService.findOne.mockRejectedValue(
        new NotFoundException('Category with ID bad-id not found'),
      );

      await expect(controller.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a category and return the updated record', async () => {
      const updated = { ...mockCategory, name: 'Electrical' };
      const serviceResult = {
        success: true,
        message: 'Category updated successfully',
        data: updated,
      };
      mockCategoryService.update.mockResolvedValue(serviceResult);

      const result = await controller.update('cat-1', { name: 'Electrical' });

      expect(result.data.name).toBe('Electrical');
      expect(mockCategoryService.update).toHaveBeenCalledWith('cat-1', { name: 'Electrical' });
    });

    it('should propagate NotFoundException when updating a non-existent category', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockCategoryService.update.mockRejectedValue(
        new NotFoundException('Category with ID ghost not found'),
      );

      await expect(controller.update('ghost', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a category and return success response', async () => {
      const serviceResult = { success: true, message: 'Category deleted successfully' };
      mockCategoryService.remove.mockResolvedValue(serviceResult);

      const result = await controller.remove('cat-1');

      expect(result.success).toBe(true);
      expect(mockCategoryService.remove).toHaveBeenCalledWith('cat-1');
    });

    it('should propagate NotFoundException when deleting a non-existent category', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockCategoryService.remove.mockRejectedValue(
        new NotFoundException('Category with ID missing not found'),
      );

      await expect(controller.remove('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
