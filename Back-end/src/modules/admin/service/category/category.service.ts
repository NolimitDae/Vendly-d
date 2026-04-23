import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CategoryService {
  constructor(private prisma: PrismaService) {}

  // Create category
  async create(createCategoryDto: CreateCategoryDto) {
    const { name } = createCategoryDto;

    const existingCategory = await this.prisma.serviceCategory.findUnique({
      where: {
        name: name,
      },
    });

    if (existingCategory) {
      throw new ConflictException('Category with this name already exists');
    }

    const category = await this.prisma.serviceCategory.create({
      data: {
        name,
      },
    });

    return {
      success: true,
      message: 'Category created successfully',
      data: category,
    };
  }

  // Get all categories
  async findAll() {
    const categories = await this.prisma.serviceCategory.findMany(
    );
    return {
      success: true,
      message: 'Categories retrieved successfully',
      data: categories,
    };
  }

  // Get a specific category by ID
  async findOne(id: string) {
    
    const category = await this.prisma.serviceCategory.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return {
      success: true,
      message: 'Category retrieved successfully',
      data: category,
    };
  }

  // Update category by ID
  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    
    const { name } = updateCategoryDto;

    const category = await this.prisma.serviceCategory.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    const existingCategory = await this.prisma.serviceCategory.findUnique({
      where: {
        name: name,
      },
    });

    if (existingCategory && existingCategory.id !== id) {
      throw new ConflictException('Another category with this name already exists');
    }

    const updatedCategory = await this.prisma.serviceCategory.update({
      where: { id },
      data: {
        name: name || category.name,  // Update name only if provided
      },
    });

    return {
      success: true,
      message: 'Category updated successfully',
      data: updatedCategory,
    };
  }

  // Delete category by ID
  async remove(id: string) {
    const category = await this.prisma.serviceCategory.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    await this.prisma.serviceCategory.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Category deleted successfully',
    };
  }
}