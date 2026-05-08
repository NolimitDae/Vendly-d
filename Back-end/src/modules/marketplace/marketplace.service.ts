import { Injectable, NotFoundException } from '@nestjs/common';
import { ListingStatus } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import appConfig from 'src/config/app.config';
import { SearchListingsDto } from './dto/search-listings.dto';

@Injectable()
export class MarketplaceService {
  constructor(private prisma: PrismaService) {}

  async searchListings(query: SearchListingsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const skip = (page - 1) * limit;

    const where: any = { status: ListingStatus.ACTIVE, deleted_at: null };

    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
        { tags: { has: query.q } },
      ];
    }

    if (query.category_id) where.category_id = query.category_id;
    if (query.sub_category_id) where.sub_category_id = query.sub_category_id;
    if (query.location) {
      where.location = { contains: query.location, mode: 'insensitive' };
    }

    if (query.min_price !== undefined || query.max_price !== undefined) {
      where.price = {};
      if (query.min_price !== undefined) where.price.gte = query.min_price;
      if (query.max_price !== undefined) where.price.lte = query.max_price;
    }

    let orderBy: any = { created_at: 'desc' };
    if (query.sort === 'price_asc') orderBy = { price: 'asc' };
    else if (query.sort === 'price_desc') orderBy = { price: 'desc' };
    else if (query.sort === 'newest') orderBy = { created_at: 'desc' };

    const [total, listings] = await Promise.all([
      this.prisma.vendorListing.count({ where }),
      this.prisma.vendorListing.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          category: { select: { id: true, name: true } },
          sub_category: { select: { id: true, name: true } },
          vendor: {
            select: {
              id: true,
              name: true,
              avatar: true,
              vendorProfile: { select: { business_name: true } },
            },
          },
          _count: { select: { reviews: true } },
        },
      }),
    ]);

    const avgRatings = await this.getAverageRatings(listings.map((l) => l.id));

    return {
      success: true,
      data: listings.map((l) => ({
        ...this.formatListingCard(l),
        avg_rating: avgRatings[l.id] ?? null,
      })),
      meta: { total, page, limit, last_page: Math.ceil(total / limit) },
    };
  }

  async getListing(id: string) {
    const listing = await this.prisma.vendorListing.findFirst({
      where: { id, status: ListingStatus.ACTIVE, deleted_at: null },
      include: {
        category: { select: { id: true, name: true } },
        sub_category: { select: { id: true, name: true } },
        vendor: {
          select: {
            id: true,
            name: true,
            avatar: true,
            created_at: true,
            vendorProfile: {
              select: {
                business_name: true,
                about_me: true,
                license_status: true,
              },
            },
          },
        },
        reviews: {
          where: { deleted_at: null },
          orderBy: { created_at: 'desc' },
          take: 10,
          include: {
            author: { select: { id: true, name: true, avatar: true } },
          },
        },
        _count: { select: { reviews: true, bookings: true } },
      },
    });

    if (!listing) throw new NotFoundException('Listing not found');

    const avgRatings = await this.getAverageRatings([listing.id]);

    return {
      success: true,
      data: {
        ...this.formatFullListing(listing),
        avg_rating: avgRatings[listing.id] ?? null,
      },
    };
  }

  async getVendorProfile(vendorId: string) {
    const vendor = await this.prisma.user.findFirst({
      where: { id: vendorId, deleted_at: null },
      select: {
        id: true,
        name: true,
        avatar: true,
        bio: true,
        location: true,
        created_at: true,
        vendorProfile: {
          select: {
            business_name: true,
            about_me: true,
            license_status: true,
          },
        },
        vendorListings: {
          where: { status: ListingStatus.ACTIVE, deleted_at: null },
          take: 6,
          include: {
            category: { select: { id: true, name: true } },
            _count: { select: { reviews: true } },
          },
        },
        _count: {
          select: {
            vendorListings: { where: { status: ListingStatus.ACTIVE } },
            receivedReviews: { where: { deleted_at: null } },
          },
        },
      },
    });

    if (!vendor) throw new NotFoundException('Vendor not found');

    const avgRating = await this.prisma.review.aggregate({
      where: { vendor_id: vendorId, deleted_at: null },
      _avg: { rating: true },
    });

    return {
      success: true,
      data: {
        ...vendor,
        avatar_url: vendor.avatar
          ? TanvirStorage.url(
              `${appConfig().storageUrl.avatar}/${vendor.avatar}`,
            )
          : null,
        avg_rating: avgRating._avg.rating,
        vendorListings: vendor.vendorListings.map((l) =>
          this.formatListingCard(l),
        ),
      },
    };
  }

  async getCategories() {
    const categories = await this.prisma.serviceCategory.findMany({
      include: {
        sub_categories: { select: { id: true, name: true } },
        _count: { select: { vendor_listings: { where: { status: ListingStatus.ACTIVE } } } },
      },
      orderBy: { name: 'asc' },
    });
    return { success: true, data: categories };
  }

  async getFeaturedListings() {
    const listings = await this.prisma.vendorListing.findMany({
      where: { status: ListingStatus.ACTIVE, deleted_at: null },
      take: 8,
      orderBy: { created_at: 'desc' },
      include: {
        category: { select: { id: true, name: true } },
        vendor: {
          select: {
            id: true,
            name: true,
            avatar: true,
            vendorProfile: { select: { business_name: true } },
          },
        },
        _count: { select: { reviews: true } },
      },
    });

    const avgRatings = await this.getAverageRatings(listings.map((l) => l.id));

    return {
      success: true,
      data: listings.map((l) => ({
        ...this.formatListingCard(l),
        avg_rating: avgRatings[l.id] ?? null,
      })),
    };
  }

  private async getAverageRatings(listingIds: string[]) {
    if (!listingIds.length) return {};
    const results = await this.prisma.review.groupBy({
      by: ['listing_id'],
      where: { listing_id: { in: listingIds }, deleted_at: null },
      _avg: { rating: true },
    });
    return Object.fromEntries(
      results.map((r) => [r.listing_id, r._avg.rating]),
    );
  }

  private formatListingCard(listing: any) {
    return {
      ...listing,
      images: (listing.images ?? []).map((img: string) =>
        TanvirStorage.url(`listings/${img}`),
      ),
      vendor: listing.vendor
        ? {
            ...listing.vendor,
            avatar_url: listing.vendor.avatar
              ? TanvirStorage.url(
                  `${appConfig().storageUrl.avatar}/${listing.vendor.avatar}`,
                )
              : null,
          }
        : null,
    };
  }

  private formatFullListing(listing: any) {
    const formatted = this.formatListingCard(listing);
    if (formatted.reviews) {
      formatted.reviews = listing.reviews.map((r: any) => ({
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
    return formatted;
  }
}
