import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SubcategoryService {
  constructor(private prisma: PrismaService) {}

  async create(createSubcategoryDto: CreateSubcategoryDto) {
    const { name, category_id } = createSubcategoryDto;

    const category = await this.prisma.serviceCategory.findUnique({
      where: { id: category_id },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${category_id} not found`);
    }

    const existingSubcategory = await this.prisma.serviceSubCategory.findUnique({
      where: {
        name_category_id: {
          name,
          category_id,
        },
      },
    });

    if (existingSubcategory) {
      throw new ConflictException('Subcategory with this name already exists in this category');
    }

    const subcategory = await this.prisma.serviceSubCategory.create({
      data: {
        name,
        category_id,
      },
      include: {
        category: true,
      },
    });

    return {
      success: true,
      message: 'Subcategory created successfully',
      data: subcategory,
    };
  }

  async findAll() {
    const subcategories = await this.prisma.serviceSubCategory.findMany({
      include: {
        category: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return {
      success: true,
      message: 'Subcategories retrieved successfully',
      data: subcategories,
    };
  }

  async findOne(id: string) {
    const subcategory = await this.prisma.serviceSubCategory.findUnique({
      where: { id },
      include: {
        category: true,
      },
    });

    if (!subcategory) {
      throw new NotFoundException(`Subcategory with ID ${id} not found`);
    }

    return {
      success: true,
      message: 'Subcategory retrieved successfully',
      data: subcategory,
    };
  }

  async update(id: string, updateSubcategoryDto: UpdateSubcategoryDto) {
    const subcategory = await this.prisma.serviceSubCategory.findUnique({
      where: { id },
    });

    if (!subcategory) {
      throw new NotFoundException(`Subcategory with ID ${id} not found`);
    }

    const targetName = updateSubcategoryDto.name ?? subcategory.name;
    const targetCategoryId = updateSubcategoryDto.category_id ?? subcategory.category_id;

    if (updateSubcategoryDto.category_id) {
      const category = await this.prisma.serviceCategory.findUnique({
        where: { id: updateSubcategoryDto.category_id },
      });

      if (!category) {
        throw new NotFoundException(`Category with ID ${updateSubcategoryDto.category_id} not found`);
      }
    }

    const existingSubcategory = await this.prisma.serviceSubCategory.findUnique({
      where: {
        name_category_id: {
          name: targetName,
          category_id: targetCategoryId,
        },
      },
    });

    if (existingSubcategory && existingSubcategory.id !== id) {
      throw new ConflictException('Another subcategory with this name already exists in this category');
    }

    const updatedSubcategory = await this.prisma.serviceSubCategory.update({
      where: { id },
      data: {
        name: updateSubcategoryDto.name,
        category_id: updateSubcategoryDto.category_id,
      },
      include: {
        category: true,
      },
    });

    return {
      success: true,
      message: 'Subcategory updated successfully',
      data: updatedSubcategory,
    };
  }

  async remove(id: string) {
    const subcategory = await this.prisma.serviceSubCategory.findUnique({
      where: { id },
    });

    if (!subcategory) {
      throw new NotFoundException(`Subcategory with ID ${id} not found`);
    }

    await this.prisma.serviceSubCategory.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Subcategory deleted successfully',
    };
  }
}
