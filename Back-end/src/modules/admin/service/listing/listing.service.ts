import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ListingStatus } from 'prisma/generated/client';

@Injectable()
export class ListingService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    page?: number;
    limit?: number;
    status?: ListingStatus;
    search?: string;
  }) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const skip = (page - 1) * limit;

    const where: any = { deleted_at: null };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, listings] = await Promise.all([
      this.prisma.vendorListing.count({ where }),
      this.prisma.vendorListing.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          vendor: {
            select: { id: true, name: true, email: true },
          },
          category: { select: { id: true, name: true } },
          _count: { select: { bookings: true, reviews: true } },
        },
      }),
    ]);

    return {
      success: true,
      data: listings,
      meta: { total, page, limit, last_page: Math.ceil(total / limit) },
    };
  }

  async updateStatus(id: string, status: ListingStatus) {
    const listing = await this.prisma.vendorListing.findFirst({
      where: { id, deleted_at: null },
    });
    if (!listing) {
      return { success: false, message: 'Listing not found' };
    }

    const updated = await this.prisma.vendorListing.update({
      where: { id },
      data: { status },
    });

    return { success: true, data: updated };
  }

  async remove(id: string) {
    const listing = await this.prisma.vendorListing.findFirst({
      where: { id, deleted_at: null },
    });
    if (!listing) {
      return { success: false, message: 'Listing not found' };
    }

    await this.prisma.vendorListing.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    return { success: true, message: 'Listing removed' };
  }
}
