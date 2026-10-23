import { Injectable, NotFoundException } from '@nestjs/common';
import { MAX_SERVICE_RADIUS, boundingBox, milesBetween } from 'src/modules/geo/geo';
import { ListingStatus } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import appConfig from 'src/config/app.config';
import { shopImageUrl } from 'src/common/helper/handle';
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

    // packages the vendor has blocked on that day are left out
    if (query.date) {
      const day = new Date(query.date + 'T00:00:00.000Z');
      where.blockedDates = { none: { start_date: { lte: day }, end_date: { gte: day } } };
    }

    // near me: a cheap box in the database, then the exact distance below
    const near = query.near_lat !== undefined && query.near_lng !== undefined ? { lat: Number(query.near_lat), lng: Number(query.near_lng) } : null;
    const radius = Number(query.radius_miles ?? 25);
    if (near) {
      // wide enough for vendors based further away who travel to the customer
      const box = boundingBox(near, Math.max(radius, MAX_SERVICE_RADIUS));
      where.lat = { gte: box.minLat, lte: box.maxLat };
      where.lng = { gte: box.minLng, lte: box.maxLng };
    }

    const sortByRating = query.sort === 'rating';
    // ratings come from reviews and distances from coordinates, so those filters / sorts run after loading
    const inMemory = sortByRating || query.min_rating !== undefined || !!near;

    let orderBy: any = { created_at: 'desc' };
    if (query.sort === 'price_asc') orderBy = { price: 'asc' };
    else if (query.sort === 'price_desc') orderBy = { price: 'desc' };
    else if (query.sort === 'newest') orderBy = { created_at: 'desc' };

    const [total, listings] = await Promise.all([
      this.prisma.vendorListing.count({ where }),
      this.prisma.vendorListing.findMany({
        where,
        skip: inMemory ? 0 : skip,
        take: inMemory ? undefined : limit,
        orderBy,
        include: {
          category: { select: { id: true, name: true, default_payment_plan: true } },
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

    let formattedListings = listings.map((l) => ({
      ...this.formatListingCard(l),
      avg_rating: avgRatings[l.id] ?? null,
      distance_miles: near && l.lat != null && l.lng != null ? Math.round(milesBetween(near, { lat: l.lat, lng: l.lng }) * 10) / 10 : null,
    }));

    let matched = total;
    // near me: listings within the customer's distance, or vendors who travel that far to them
    if (near) formattedListings = formattedListings.filter((l) => l.distance_miles != null && (l.distance_miles <= radius || (!!l.service_radius_miles && l.distance_miles <= l.service_radius_miles)));
    if (query.min_rating !== undefined) formattedListings = formattedListings.filter((l) => (l.avg_rating ?? 0) >= query.min_rating!);
    if (inMemory) matched = formattedListings.length;
    if (sortByRating) formattedListings.sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0));
    else if (near && (query.sort === 'distance' || !query.sort)) formattedListings.sort((a, b) => (a.distance_miles ?? 1e9) - (b.distance_miles ?? 1e9));
    if (inMemory) formattedListings = formattedListings.slice(skip, skip + limit);

    return {
      success: true,
      data: formattedListings,
      meta: { total: matched, page, limit, last_page: Math.ceil(matched / limit) },
    };
  }

  async getListing(id: string) {
    const listing = await this.prisma.vendorListing.findFirst({
      where: { id, status: ListingStatus.ACTIVE, deleted_at: null },
      include: {
        category: { select: { id: true, name: true, default_payment_plan: true } },
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

  /** Looks a vendor up by id or by shop handle (vendlymarketplace.com/v/<handle>). */
  async getVendorProfile(idOrHandle: string) {
    const vendor = await this.prisma.user.findFirst({
      where: {
        deleted_at: null,
        OR: [{ id: idOrHandle }, { vendorProfile: { handle: idOrHandle.toLowerCase() } }],
      },
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
            handle: true,
            banner: true,
            logo: true,
          },
        },
        vendorListings: {
          where: { status: ListingStatus.ACTIVE, deleted_at: null },
          take: 6,
          include: {
            category: { select: { id: true, name: true, default_payment_plan: true } },
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
      where: { vendor_id: vendor.id, deleted_at: null },
      _avg: { rating: true },
    });

    return {
      success: true,
      data: {
        ...vendor,
        handle: vendor.vendorProfile?.handle ?? null,
        banner_url: shopImageUrl(vendor.vendorProfile?.banner),
        logo_url: shopImageUrl(vendor.vendorProfile?.logo),
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

  async getBlockedDates(listingId: string) {
    const blocks = await this.prisma.listingAvailability.findMany({
      where: { listing_id: listingId },
      select: { id: true, start_date: true, end_date: true, reason: true },
      orderBy: { start_date: 'asc' },
    });
    return { success: true, data: blocks };
  }

  async getFeaturedListings() {
    const listings = await this.prisma.vendorListing.findMany({
      where: { status: ListingStatus.ACTIVE, deleted_at: null },
      take: 8,
      orderBy: { created_at: 'desc' },
      include: {
        category: { select: { id: true, name: true, default_payment_plan: true } },
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
      // what the customer will be asked to pay and when (vendor's choice, else the category default)
      effective_payment_plan: listing.payment_plan ?? listing.category?.default_payment_plan ?? 'FULL_ON_ACCEPT',
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
