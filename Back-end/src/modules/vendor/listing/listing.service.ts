import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ListingStatus } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import { StringHelper } from 'src/common/helper/string.helper';
import appConfig from 'src/config/app.config';
import { CreateVendorListingDto } from './dto/create-listing.dto';
import { UpdateVendorListingDto } from './dto/update-listing.dto';

@Injectable()
export class VendorListingService {
  constructor(private prisma: PrismaService) {}

  async create(
    vendorId: string,
    dto: CreateVendorListingDto,
    images?: Express.Multer.File[],
  ) {
    const imageNames: string[] = [];
    if (images?.length) {
      for (const file of images) {
        const fileName = `${StringHelper.randomString()}_${file.originalname}`;
        await TanvirStorage.put(
          `listings/${fileName}`,
          file.buffer,
        );
        imageNames.push(fileName);
      }
    }

    const listing = await this.prisma.vendorListing.create({
      data: {
        vendor_id: vendorId,
        title: dto.title,
        description: dto.description,
        price: dto.price,
        price_unit: dto.price_unit ?? 'fixed',
        status: dto.status ?? ListingStatus.DRAFT,
        location: dto.location,
        availability: dto.availability,
        delivery_time: dto.delivery_time,
        category_id: dto.category_id,
        sub_category_id: dto.sub_category_id,
        tags: dto.tags ?? [],
        images: imageNames,
      },
      include: {
        category: { select: { id: true, name: true } },
        sub_category: { select: { id: true, name: true } },
      },
    });

    return { success: true, data: this.formatListing(listing) };
  }

  async findMyListings(
    vendorId: string,
    query: { page?: number; limit?: number; status?: ListingStatus },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: any = { vendor_id: vendorId, deleted_at: null };
    if (query.status) where.status = query.status;

    const [total, listings] = await Promise.all([
      this.prisma.vendorListing.count({ where }),
      this.prisma.vendorListing.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          category: { select: { id: true, name: true } },
          sub_category: { select: { id: true, name: true } },
          _count: { select: { bookings: true, reviews: true } },
        },
      }),
    ]);

    return {
      success: true,
      data: listings.map((l) => this.formatListing(l)),
      meta: { total, page, limit, last_page: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, vendorId?: string) {
    const listing = await this.prisma.vendorListing.findFirst({
      where: { id, deleted_at: null },
      include: {
        category: { select: { id: true, name: true } },
        sub_category: { select: { id: true, name: true } },
        vendor: {
          select: {
            id: true,
            name: true,
            avatar: true,
            vendorProfile: { select: { business_name: true, about_me: true } },
          },
        },
        reviews: {
          where: { deleted_at: null },
          orderBy: { created_at: 'desc' },
          take: 5,
          include: { author: { select: { id: true, name: true, avatar: true } } },
        },
        _count: { select: { bookings: true, reviews: true } },
      },
    });

    if (!listing) throw new NotFoundException('Listing not found');
    if (vendorId && listing.vendor_id !== vendorId)
      throw new ForbiddenException('Access denied');

    return { success: true, data: this.formatListing(listing) };
  }

  async update(
    id: string,
    vendorId: string,
    dto: UpdateVendorListingDto,
    images?: Express.Multer.File[],
  ) {
    const listing = await this.prisma.vendorListing.findFirst({
      where: { id, deleted_at: null },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.vendor_id !== vendorId)
      throw new ForbiddenException('Access denied');

    const updateData: any = { ...dto };

    if (images?.length) {
      // delete old images
      for (const img of listing.images) {
        await TanvirStorage.delete(`listings/${img}`).catch(() => null);
      }
      const imageNames: string[] = [];
      for (const file of images) {
        const fileName = `${StringHelper.randomString()}_${file.originalname}`;
        await TanvirStorage.put(`listings/${fileName}`, file.buffer);
        imageNames.push(fileName);
      }
      updateData.images = imageNames;
    }

    const updated = await this.prisma.vendorListing.update({
      where: { id },
      data: updateData,
      include: {
        category: { select: { id: true, name: true } },
        sub_category: { select: { id: true, name: true } },
      },
    });

    return { success: true, data: this.formatListing(updated) };
  }

  async remove(id: string, vendorId: string) {
    const listing = await this.prisma.vendorListing.findFirst({
      where: { id, deleted_at: null },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.vendor_id !== vendorId)
      throw new ForbiddenException('Access denied');

    await this.prisma.vendorListing.update({
      where: { id },
      data: { deleted_at: new Date(), status: ListingStatus.ARCHIVED },
    });

    return { success: true, message: 'Listing removed' };
  }

  async publishListing(id: string, vendorId: string) {
    const listing = await this.prisma.vendorListing.findFirst({
      where: { id, deleted_at: null },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.vendor_id !== vendorId)
      throw new ForbiddenException('Access denied');
    if (!listing.images.length)
      throw new BadRequestException('Add at least one image before publishing');

    const updated = await this.prisma.vendorListing.update({
      where: { id },
      data: { status: ListingStatus.ACTIVE },
    });

    return { success: true, data: updated };
  }

  private formatListing(listing: any) {
    const base = { ...listing };
    base.images = (listing.images ?? []).map((img: string) =>
      TanvirStorage.url(`listings/${img}`),
    );
    if (listing.vendor?.avatar) {
      base.vendor = {
        ...listing.vendor,
        avatar_url: TanvirStorage.url(
          `${appConfig().storageUrl.avatar}/${listing.vendor.avatar}`,
        ),
      };
    }
    if (listing.reviews) {
      base.reviews = listing.reviews.map((r: any) => ({
        ...r,
        author: r.author
          ? {
              ...r.author,
              avatar_url: r.author.avatar
                ? TanvirStorage.url(
                    `${appConfig().storageUrl.avatar}/${r.author.avatar}`,
                  )
                : null,
            }
          : null,
      }));
    }
    return base;
  }
}
