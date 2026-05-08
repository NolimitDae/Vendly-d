import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SubcategoryController } from './subcategory.controller';
import { SubcategoryService } from './subcategory.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';

const mockSubcategory = {
  id: 'sub-1',
  name: 'Pipe Repair',
  category_id: 'cat-1',
  category: { id: 'cat-1', name: 'Plumbing' },
};

const mockSubcategoryService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('SubcategoryController', () => {
  let controller: SubcategoryController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubcategoryController],
      providers: [
        { provide: SubcategoryService, useValue: mockSubcategoryService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SubcategoryController>(SubcategoryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should return the newly created subcategory from the service', async () => {
      const serviceResult = {
        success: true,
        message: 'Subcategory created successfully',
        data: mockSubcategory,
      };
      mockSubcategoryService.create.mockResolvedValue(serviceResult);

      const result = await controller.create({ name: 'Pipe Repair', category_id: 'cat-1' });

      expect(result).toEqual(serviceResult);
      expect(mockSubcategoryService.create).toHaveBeenCalledWith({
        name: 'Pipe Repair',
        category_id: 'cat-1',
      });
    });

    it('should propagate NotFoundException when the parent category does not exist', async () => {
      mockSubcategoryService.create.mockRejectedValue(
        new NotFoundException('Category with ID bad-cat not found'),
      );

      await expect(
        controller.create({ name: 'X', category_id: 'bad-cat' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all subcategories from the service', async () => {
      const serviceResult = {
        success: true,
        message: 'Subcategories retrieved successfully',
        data: [mockSubcategory],
      };
      mockSubcategoryService.findAll.mockResolvedValue(serviceResult);

      const result = await controller.findAll();

      expect(result).toEqual(serviceResult);
      expect(mockSubcategoryService.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return an empty data array when no subcategories exist', async () => {
      const serviceResult = {
        success: true,
        message: 'Subcategories retrieved successfully',
        data: [],
      };
      mockSubcategoryService.findAll.mockResolvedValue(serviceResult);

      const result = await controller.findAll();

      expect(result.data).toHaveLength(0);
    });
  });

  describe('findOne', () => {
    it('should return a single subcategory by id', async () => {
      const serviceResult = {
        success: true,
        message: 'Subcategory retrieved successfully',
        data: mockSubcategory,
      };
      mockSubcategoryService.findOne.mockResolvedValue(serviceResult);

      const result = await controller.findOne('sub-1');

      expect(result).toEqual(serviceResult);
      expect(mockSubcategoryService.findOne).toHaveBeenCalledWith('sub-1');
    });

    it('should propagate NotFoundException from the service', async () => {
      mockSubcategoryService.findOne.mockRejectedValue(
        new NotFoundException('Subcategory with ID bad-id not found'),
      );

      await expect(controller.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a subcategory and return the updated record', async () => {
      const updated = { ...mockSubcategory, name: 'Drain Cleaning' };
      const serviceResult = {
        success: true,
        message: 'Subcategory updated successfully',
        data: updated,
      };
      mockSubcategoryService.update.mockResolvedValue(serviceResult);

      const result = await controller.update('sub-1', { name: 'Drain Cleaning' });

      expect(result.data.name).toBe('Drain Cleaning');
      expect(mockSubcategoryService.update).toHaveBeenCalledWith('sub-1', { name: 'Drain Cleaning' });
    });

    it('should propagate NotFoundException when updating a non-existent subcategory', async () => {
      mockSubcategoryService.update.mockRejectedValue(
        new NotFoundException('Subcategory with ID ghost not found'),
      );

      await expect(controller.update('ghost', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a subcategory and return success response', async () => {
      const serviceResult = { success: true, message: 'Subcategory deleted successfully' };
      mockSubcategoryService.remove.mockResolvedValue(serviceResult);

      const result = await controller.remove('sub-1');

      expect(result.success).toBe(true);
      expect(mockSubcategoryService.remove).toHaveBeenCalledWith('sub-1');
    });

    it('should propagate NotFoundException when deleting a non-existent subcategory', async () => {
      mockSubcategoryService.remove.mockRejectedValue(
        new NotFoundException('Subcategory with ID missing not found'),
      );

      await expect(controller.remove('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
