import { Injectable, NotFoundException } from '@nestjs/common';
import { ListingStatus } from 'prisma/generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_VENDOR_WHERE } from 'src/common/helper/active-vendor';
import { shopImageUrl } from 'src/common/helper/handle';

/** Vendors customers can find: not suspended or deleted, and set up as a vendor (has a vendor profile). */
export const LIVE_VENDOR_WHERE = { ...ACTIVE_VENDOR_WHERE, vendorProfile: { isNot: null } };

const LIVE_LISTING = { status: ListingStatus.ACTIVE, deleted_at: null };

// Only what a shop card shows: no email, phone, business address or position (those stay private).
const VENDOR_CARD_SELECT = {
  id: true,
  name: true,
  avatar: true,
  location: true,
  is_test: true,
  vendorProfile: { select: { business_name: true, handle: true, logo: true } },
  vendorListings: {
    where: LIVE_LISTING,
    distinct: ['category_id' as const],
    take: 3,
    select: { category: { select: { name: true } } },
  },
  _count: { select: { vendorListings: { where: LIVE_LISTING } } },
};

@Injectable()
export class SavedVendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async save(userId: string, vendorId: string) {
    // only a live vendor can be saved; anything else is "not found", the same as their shop page
    const vendor =
      typeof vendorId === 'string' && vendorId
        ? await this.prisma.user.findFirst({ where: { id: vendorId, ...LIVE_VENDOR_WHERE }, select: { id: true } })
        : null;
    if (!vendor) throw new NotFoundException('Vendor not found');

    const saved = await this.prisma.savedVendor.upsert({
      where: { user_id_vendor_id: { user_id: userId, vendor_id: vendor.id } },
      create: { user_id: userId, vendor_id: vendor.id },
      update: {},
      select: { id: true, vendor_id: true, created_at: true },
    });
    return { success: true, data: saved };
  }

  async remove(userId: string, vendorId: string) {
    await this.prisma.savedVendor.deleteMany({
      where: { user_id: userId, vendor_id: String(vendorId) },
    });
    return { success: true };
  }

  /** Saved vendors still on the marketplace; suspended, deleted and non-vendor accounts drop out. */
  async findAll(userId: string) {
    const saved = await this.prisma.savedVendor.findMany({
      where: { user_id: userId, vendor: LIVE_VENDOR_WHERE },
      select: { id: true, created_at: true, vendor: { select: VENDOR_CARD_SELECT } },
      orderBy: { created_at: 'desc' },
    });

    const ids = saved.map((s) => s.vendor.id);
    const ratings = ids.length
      ? await this.prisma.review.groupBy({
          by: ['vendor_id'],
          where: { vendor_id: { in: ids }, deleted_at: null },
          _avg: { rating: true },
          _count: { _all: true },
        })
      : [];
    const ratingOf = new Map(ratings.map((r) => [r.vendor_id, r]));

    return {
      success: true,
      data: saved.map(({ id, created_at, vendor: v }) => {
        const r = ratingOf.get(v.id);
        return {
          id,
          created_at,
          vendor: {
            id: v.id,
            name: v.name,
            business_name: v.vendorProfile?.business_name ?? null,
            handle: v.vendorProfile?.handle ?? null,
            avatar_url: shopImageUrl(v.avatar),
            logo_url: shopImageUrl(v.vendorProfile?.logo),
            location: v.location ?? null,
            categories: v.vendorListings.map((l) => l.category?.name).filter((n): n is string => !!n),
            listing_count: v._count.vendorListings,
            avg_rating: r?._avg.rating ?? null,
            review_count: r?._count._all ?? 0,
            is_test: v.is_test,
          },
        };
      }),
    };
  }

  async getSavedIds(userId: string) {
    const saved = await this.prisma.savedVendor.findMany({
      where: { user_id: userId, vendor: LIVE_VENDOR_WHERE },
      select: { vendor_id: true },
    });
    return { success: true, data: saved.map((s) => s.vendor_id) };
  }
}
