import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SavedListingsService {
  constructor(private readonly prisma: PrismaService) {}

  async save(userId: string, listingId: string) {
    const saved = await this.prisma.savedListing.upsert({
      where: { user_id_listing_id: { user_id: userId, listing_id: listingId } },
      create: { user_id: userId, listing_id: listingId },
      update: {},
    });
    return { success: true, data: saved };
  }

  async remove(userId: string, listingId: string) {
    await this.prisma.savedListing.deleteMany({
      where: { user_id: userId, listing_id: listingId },
    });
    return { success: true };
  }

  async findAll(userId: string) {
    const saved = await this.prisma.savedListing.findMany({
      where: { user_id: userId },
      include: {
        listing: {
          include: {
            vendor: {
              select: {
                id: true,
                name: true,
                avatar: true,
                vendorProfile: { select: { business_name: true } },
              },
            },
            category: { select: { id: true, name: true } },
            _count: { select: { reviews: true, bookings: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
    return { success: true, data: saved };
  }

  async getSavedIds(userId: string) {
    const saved = await this.prisma.savedListing.findMany({
      where: { user_id: userId },
      select: { listing_id: true },
    });
    return { success: true, data: saved.map((s) => s.listing_id) };
  }
}
