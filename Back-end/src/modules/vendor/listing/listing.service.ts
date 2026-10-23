import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ListingStatus } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { GeocodeService } from 'src/modules/geo/geocode.service';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import { StringHelper } from 'src/common/helper/string.helper';
import appConfig from 'src/config/app.config';
import { CreateVendorListingDto } from './dto/create-listing.dto';
import { UpdateVendorListingDto } from './dto/update-listing.dto';

/** Minimum and maximum guests / hours / days, or nulls for a flat price. Throws if they don't make sense. */
export function quantityLimits(priceUnit: string, min?: number | null, max?: number | null) {
  if (!['person', 'hour', 'day'].includes(priceUnit)) return { min_quantity: null, max_quantity: null };
  const lo = min && min > 0 ? Math.floor(min) : null;
  const hi = max && max > 0 ? Math.floor(max) : null;
  if (lo && hi && lo > hi) throw new BadRequestException('The minimum can’t be more than the maximum.');
  return { min_quantity: lo, max_quantity: hi };
}

@Injectable()
export class VendorListingService {
  constructor(
    private prisma: PrismaService,
    @Optional() private geocoder?: GeocodeService,
  ) {}

  /** A sub-category must belong to the package's category. */
  /** Checks the sub-category belongs to the category; returns the category to save (the sub-category's own when none was chosen). */
  private async assertSubCategory(categoryId?: string | null, subCategoryId?: string | null) {
    if (!subCategoryId) return categoryId;
    const sub = await this.prisma.serviceSubCategory.findUnique({ where: { id: subCategoryId }, select: { category_id: true } });
    if (!sub || (categoryId && sub.category_id !== categoryId)) {
      throw new BadRequestException('That sub-category doesn’t belong to the chosen category.');
    }
    return sub.category_id;
  }

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

    const categoryId = await this.assertSubCategory(dto.category_id, dto.sub_category_id);
    const limits = quantityLimits(dto.price_unit ?? 'fixed', dto.min_quantity, dto.max_quantity);
    const listing = await this.prisma.vendorListing.create({
      data: {
        vendor_id: vendorId,
        title: dto.title,
        description: dto.description,
        price: dto.price,
        price_unit: dto.price_unit ?? 'fixed',
        status: dto.status ?? ListingStatus.DRAFT,
        location: dto.location,
        // picked from address suggestions: the position is known, no geocoding needed
        ...(dto.lat !== undefined && dto.lng !== undefined && dto.location && { lat: dto.lat, lng: dto.lng, geocoded_at: new Date() }),
        service_radius_miles: dto.service_radius_miles,
        availability: dto.availability,
        delivery_time: dto.delivery_time,
        category_id: categoryId,
        sub_category_id: dto.sub_category_id,
        tags: dto.tags ?? [],
        images: imageNames,
        payment_plan: dto.payment_plan,
        ...limits,
      },
      include: {
        category: { select: { id: true, name: true } },
        sub_category: { select: { id: true, name: true } },
      },
    });

    // map position for "near me" search, filled in the background
    if (listing.location && listing.lat == null) void this.geocoder?.listing(listing.id);

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
    // limits only mean something for per person / hour / day prices; 0 clears one
    if (dto.min_quantity !== undefined || dto.max_quantity !== undefined || dto.price_unit !== undefined) {
      Object.assign(
        updateData,
        quantityLimits(
          dto.price_unit ?? listing.price_unit,
          dto.min_quantity !== undefined ? dto.min_quantity : listing.min_quantity,
          dto.max_quantity !== undefined ? dto.max_quantity : listing.max_quantity,
        ),
      );
    }
    // forms send an empty value to clear a category or sub-category
    if (dto.category_id === '') updateData.category_id = null;
    if (dto.sub_category_id === '') updateData.sub_category_id = null;
    // a new category without a new sub-category drops the old one, which belonged to the old category
    if (dto.category_id !== undefined && dto.sub_category_id === undefined && (dto.category_id || null) !== listing.category_id) {
      updateData.sub_category_id = null;
    }
    if (dto.category_id === '' && updateData.sub_category_id) {
      throw new BadRequestException('Choose a category for that sub-category.');
    }
    const currentCategory = updateData.category_id !== undefined ? updateData.category_id : listing.category_id;
    const categoryId = await this.assertSubCategory(currentCategory, updateData.sub_category_id);
    if (categoryId !== currentCategory) updateData.category_id = categoryId;
    const moved = dto.location !== undefined && (dto.location || null) !== (listing.location || null);
    const pinned = dto.lat !== undefined && dto.lng !== undefined && !!(dto.location ?? listing.location);
    if (pinned) {
      // picked from address suggestions: the position is known
      updateData.geocoded_at = new Date();
    } else {
      // coordinates are only taken together with a location
      delete updateData.lat;
      delete updateData.lng;
    }
    if (moved && !pinned) {
      // the old coordinates no longer apply; re-geocoded below (or by the hourly backfill)
      updateData.lat = null;
      updateData.lng = null;
      updateData.geocoded_at = null;
    }

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

    if (moved && !pinned && updated.location) void this.geocoder?.listing(id);

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

  async pauseListing(id: string, vendorId: string) {
    const listing = await this.prisma.vendorListing.findFirst({
      where: { id, deleted_at: null },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.vendor_id !== vendorId)
      throw new ForbiddenException('Access denied');
    if (listing.status !== ListingStatus.ACTIVE)
      throw new BadRequestException('Only active listings can be paused');

    const updated = await this.prisma.vendorListing.update({
      where: { id },
      data: { status: ListingStatus.PAUSED },
    });

    return { success: true, data: updated };
  }

  async blockDates(
    listingId: string,
    vendorId: string,
    dto: { start_date: Date; end_date: Date; reason?: string },
  ) {
    const listing = await this.prisma.vendorListing.findFirst({
      where: { id: listingId, deleted_at: null },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.vendor_id !== vendorId) throw new ForbiddenException('Access denied');
    if (dto.start_date > dto.end_date)
      throw new BadRequestException('start_date must be before end_date');

    const block = await this.prisma.listingAvailability.create({
      data: {
        listing_id: listingId,
        start_date: dto.start_date,
        end_date: dto.end_date,
        reason: dto.reason,
      },
    });
    return { success: true, data: block };
  }

  async unblockDates(blockId: string, vendorId: string) {
    const block = await this.prisma.listingAvailability.findUnique({
      where: { id: blockId },
      include: { listing: { select: { vendor_id: true } } },
    });
    if (!block) throw new NotFoundException('Availability block not found');
    if (block.listing.vendor_id !== vendorId) throw new ForbiddenException('Access denied');

    await this.prisma.listingAvailability.delete({ where: { id: blockId } });
    return { success: true };
  }

  async getBlockedDates(listingId: string) {
    const blocks = await this.prisma.listingAvailability.findMany({
      where: { listing_id: listingId },
      orderBy: { start_date: 'asc' },
    });
    return { success: true, data: blocks };
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
