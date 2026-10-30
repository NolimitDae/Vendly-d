import { Injectable, NotFoundException } from '@nestjs/common';
import { MAX_SERVICE_RADIUS, boundingBox, geocode, milesBetween, withoutPosition } from 'src/modules/geo/geo';
import { bookingNeeds } from 'src/modules/booking/booking-place';
import { travelSummary } from 'src/modules/booking/travel-fee';
import { ListingStatus, PaymentPlan, VendorContractStatus } from 'prisma/generated/client';
import { planLabel } from 'src/modules/payments/payment-schedule';
import { formatAddOn } from 'src/modules/add-ons/add-ons.service';
import { formatOptionGroups, OPTION_GROUPS_INCLUDE } from 'src/modules/add-ons/package-options.service';
import { CANCELLATION_PRESETS } from 'src/modules/contracts/contract-templates';
import { pickContractForListing } from 'src/modules/contracts/contract-scope';
import { PrismaService } from 'src/prisma/prisma.service';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import appConfig from 'src/config/app.config';
import { shopImageUrl } from 'src/common/helper/handle';
import { readSocials, SOCIALS_SELECT } from 'src/common/helper/social-links';
import { mergeDayRanges, todayUtc } from 'src/modules/calendar-sync/busy-days';
import { readWorkingHours, summariseWorkingHours } from 'src/modules/vendor/working-hours';
import { ACTIVE_VENDOR_WHERE } from 'src/common/helper/active-vendor';
import { SearchListingsDto } from './dto/search-listings.dto';
import { penalisedVendorIds } from 'src/modules/booking/vendor-cancellations';

/** How long the list of vendors shown last in search is reused before it is read again. */
const PENALISED_TTL_MS = 5 * 60 * 1000;

/** How far "near me" looks by default (miles). */
export const DEFAULT_RADIUS_MILES = 25;

/** Listing filter: packages customers can see and book: ACTIVE, not deleted, and the vendor isn't suspended or deleted. */
export function liveListingWhere() {
  return { status: ListingStatus.ACTIVE, deleted_at: null, vendor: { ...ACTIVE_VENDOR_WHERE } };
}

/**
 * Listing filter: packages bookable on a day (yyyy-MM-dd): not blocked by the vendor, and the vendor's own calendar isn't busy.
 * It replaces the `vendor` filter of liveListingWhere, so it keeps the active-vendor rule too.
 */
export function availableOnDayWhere(date: string) {
  const day = new Date(date + 'T00:00:00.000Z');
  return {
    blockedDates: { none: { start_date: { lte: day }, end_date: { gte: day } } },
    vendor: { ...ACTIVE_VENDOR_WHERE, calendarBusyBlocks: { none: { start_date: { lte: day }, end_date: { gte: day } } } },
  };
}

/** Listing filter: a cheap box around a point, wide enough for vendors based further away who travel to the customer. */
export function nearBoxWhere(near: { lat: number; lng: number }, radius: number) {
  const box = boundingBox(near, Math.max(radius, MAX_SERVICE_RADIUS));
  return { lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } };
}

/**
 * The words of what a customer typed, for matching word by word: "makeup smyrna" finds a makeup
 * package in Smyrna, "Smyrna, DE" matches a package in "Smyrna, Kent, DE". At most 6 words.
 */
export function searchWords(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((w) => w.trim()).filter((w) => w.length >= 2))].slice(0, 6);
}

/** Listing filter: every typed word appears somewhere about the package (title, description, place, category, vendor, tags). */
export function textSearchWhere(q: string) {
  const has = (w: string) => ({ contains: w, mode: 'insensitive' as const });
  return searchWords(q).map((w) => ({
    OR: [
      { title: has(w) },
      { description: has(w) },
      { location: has(w) },
      { category: { name: has(w) } },
      { sub_category: { name: has(w) } },
      { vendor: { vendorProfile: { business_name: has(w) } } },
      { tags: { has: w.toLowerCase() } },
    ],
  }));
}

/** Listing filter: every word of a typed place appears in the package's location ("Smyrna, DE" matches "Smyrna, Kent, DE"). */
export function placeTextWhere(place: string) {
  return searchWords(place).map((w) => ({ location: { contains: w, mode: 'insensitive' as const } }));
}

/** The point of a typed place, or null when it can't be found in time (search then matches the place by its words). */
async function placePoint(place: string): Promise<{ lat: number; lng: number } | null> {
  try {
    return await geocode(place, (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(2500) }));
  } catch {
    return null;
  }
}

/** Near me: the listing is within the customer's distance, or the vendor travels that far to them. */
export function withinReach(distanceMiles: number | null | undefined, radius: number, serviceRadiusMiles?: number | null) {
  return distanceMiles != null && (distanceMiles <= radius || (!!serviceRadiusMiles && distanceMiles <= serviceRadiusMiles));
}

@Injectable()
export class MarketplaceService {
  constructor(private prisma: PrismaService) {}

  private penalised: { ids: Set<string>; at: number } | null = null;

  /**
   * Vendors with 2 or more cancellations of their own in the last 90 days (booking/vendor-cancellations.ts).
   * Read at most every few minutes; search never fails because of it.
   */
  private async penalisedVendors(): Promise<Set<string>> {
    if (this.penalised && Date.now() - this.penalised.at < PENALISED_TTL_MS) return this.penalised.ids;
    try {
      this.penalised = { ids: new Set(await penalisedVendorIds(this.prisma)), at: Date.now() };
    } catch {
      this.penalised = { ids: new Set(), at: Date.now() };
    }
    return this.penalised.ids;
  }

  async searchListings(query: SearchListingsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const skip = (page - 1) * limit;

    const where: any = liveListingWhere();

    // conditions combined with AND (each typed word, the place)
    const and: any[] = [];
    if (query.q) and.push(...textSearchWhere(query.q));

    if (query.category_id) where.category_id = query.category_id;
    if (query.sub_category_id) where.sub_category_id = query.sub_category_id;

    if (query.min_price !== undefined || query.max_price !== undefined) {
      where.price = {};
      if (query.min_price !== undefined) where.price.gte = query.min_price;
      if (query.max_price !== undefined) where.price.lte = query.max_price;
    }

    // packages the vendor has blocked on that day are left out, and so are vendors whose own calendar is busy
    if (query.date) Object.assign(where, availableOnDayWhere(query.date));

    // near me: a cheap box in the database, then the exact distance below
    let near = query.near_lat !== undefined && query.near_lng !== undefined ? { lat: Number(query.near_lat), lng: Number(query.near_lng) } : null;
    const radius = Number(query.radius_miles ?? DEFAULT_RADIUS_MILES);
    // a typed place is searched by distance like near me, so nearby towns count too; packages not
    // placed on the map yet match by the place's words, and so does everything when the place can't be found
    let byPlaceWords = false;
    if (query.location && !near) {
      near = await placePoint(query.location);
      if (near) {
        and.push({ OR: [nearBoxWhere(near, radius), { lat: null, AND: placeTextWhere(query.location) }] });
        byPlaceWords = true;
      } else {
        and.push(...placeTextWhere(query.location));
      }
    } else if (near) {
      Object.assign(where, nearBoxWhere(near, radius));
    }
    if (and.length) where.AND = and;

    const sortByRating = query.sort === 'rating';
    // ratings come from reviews and distances from coordinates, so those filters / sorts run after loading
    const inMemory = sortByRating || query.min_rating !== undefined || !!near;

    let orderBy: any = { created_at: 'desc' };
    if (query.sort === 'price_asc') orderBy = { price: 'asc' };
    else if (query.sort === 'price_desc') orderBy = { price: 'desc' };
    else if (query.sort === 'newest') orderBy = { created_at: 'desc' };

    const load = (w: any, from?: number, take?: number) =>
      this.prisma.vendorListing.findMany({
        where: w,
        skip: from,
        take,
        orderBy,
        include: {
          category: { select: { id: true, name: true, default_payment_plan: true } },
          sub_category: { select: { id: true, name: true } },
          vendor: {
            select: {
              id: true,
              name: true,
              avatar: true,
              is_test: true,
              vendorProfile: { select: { business_name: true } },
            },
          },
          _count: { select: { reviews: true } },
        },
      });

    // Vendors who cancelled too often (2+ of their own cancellations in 90 days) are shown after
    // everyone else, in the same order otherwise: the page is filled from the others first.
    const penalised = await this.penalisedVendors();
    let total: number;
    let listings: Awaited<ReturnType<typeof load>>;
    if (inMemory || !penalised.size) {
      [total, listings] = await Promise.all([this.prisma.vendorListing.count({ where }), load(where, inMemory ? 0 : skip, inMemory ? undefined : limit)]);
    } else {
      const ids = [...penalised];
      const first = { AND: [where, { vendor_id: { notIn: ids } }] };
      const last = { AND: [where, { vendor_id: { in: ids } }] };
      const [all, firstCount] = await Promise.all([this.prisma.vendorListing.count({ where }), this.prisma.vendorListing.count({ where: first })]);
      total = all;
      const head = firstCount > skip ? await load(first, skip, limit) : [];
      const tail = head.length < limit ? await load(last, Math.max(0, skip - firstCount), limit - head.length) : [];
      listings = [...head, ...tail];
    }

    const avgRatings = await this.getAverageRatings(listings.map((l) => l.id));

    let formattedListings = listings.map((l) => ({
      ...this.formatListingCard(l),
      avg_rating: avgRatings[l.id] ?? null,
      distance_miles: near && l.lat != null && l.lng != null ? Math.round(milesBetween(near, { lat: l.lat, lng: l.lng }) * 10) / 10 : null,
    }));

    let matched = total;
    // near me: listings within the customer's distance, or vendors who travel that far to them
    if (near) formattedListings = formattedListings.filter((l) => withinReach(l.distance_miles, radius, l.service_radius_miles) || (byPlaceWords && l.distance_miles == null));
    if (query.min_rating !== undefined) formattedListings = formattedListings.filter((l) => (l.avg_rating ?? 0) >= query.min_rating!);
    if (inMemory) matched = formattedListings.length;
    if (sortByRating) formattedListings.sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0));
    else if (near && (query.sort === 'distance' || !query.sort)) formattedListings.sort((a, b) => (a.distance_miles ?? 1e9) - (b.distance_miles ?? 1e9));
    // vendors who cancelled too often go last, keeping the order above (sort is stable)
    if (inMemory && penalised.size) formattedListings.sort((a, b) => Number(penalised.has(a.vendor_id)) - Number(penalised.has(b.vendor_id)));
    if (inMemory) formattedListings = formattedListings.slice(skip, skip + limit);

    return {
      success: true,
      data: formattedListings,
      meta: { total: matched, page, limit, last_page: Math.ceil(matched / limit) },
    };
  }

  /**
   * Up to `take` packages in the same category, from other active vendors free on `date` (yyyy-MM-dd),
   * for a customer whose vendor cancelled. Search's own order and filters (including the ranking above).
   */
  async similarAvailable(input: { categoryId: string; date: string; excludeVendorId: string; take?: number }) {
    const take = input.take ?? 4;
    const res = await this.searchListings({ category_id: input.categoryId, date: input.date, limit: take * 3 } as SearchListingsDto);
    const seen = new Set<string>([input.excludeVendorId]);
    const picks: { id: string; title: string; price: number; image: string | null; vendor_id: string; vendor_name: string | null; avg_rating: number | null }[] = [];
    // one package per vendor
    for (const l of res.data as any[]) {
      if (seen.has(l.vendor_id)) continue;
      seen.add(l.vendor_id);
      picks.push({ id: l.id, title: l.title, price: Number(l.price ?? 0), image: l.images?.[0] ?? null, vendor_id: l.vendor_id, vendor_name: l.vendor?.vendorProfile?.business_name || l.vendor?.name || null, avg_rating: l.avg_rating ?? null });
      if (picks.length >= take) break;
    }
    return picks;
  }

  async getListing(id: string) {
    const listing = await this.prisma.vendorListing.findFirst({
      where: { id, ...liveListingWhere() },
      include: {
        category: { select: { id: true, name: true, default_payment_plan: true } },
        sub_category: { select: { id: true, name: true } },
        vendor: {
          select: {
            id: true,
            name: true,
            avatar: true,
            created_at: true,
            is_test: true,
            vendorProfile: {
              select: {
                business_name: true,
                about_me: true,
                license_status: true,
                working_hours: true,
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
        add_ons: { where: { add_on: { deleted_at: null } }, include: { add_on: true }, orderBy: [{ sort: 'asc' }, { created_at: 'asc' }] },
        option_groups: OPTION_GROUPS_INCLUDE,
      },
    });

    if (!listing) throw new NotFoundException('Listing not found');

    const [avgRatings, cancellationPolicy] = await Promise.all([
      this.getAverageRatings([listing.id]),
      this.cancellationPolicyFor(listing.vendor_id, listing.id, listing.category_id).catch(() => null),
    ]);

    const workingHours = readWorkingHours(listing.vendor?.vendorProfile?.working_hours);
    return {
      success: true,
      data: {
        ...this.formatFullListing(listing),
        avg_rating: avgRatings[listing.id] ?? null,
        // weekly hours customers can book in (null = any day, any time), and a short line for the page
        working_hours: workingHours,
        working_hours_summary: summariseWorkingHours(workingHours),
        // the policy in the contract a booking of this package would use, so customers see it before booking
        cancellation_policy: cancellationPolicy,
        // the delivery / travel fee rates (null: none), so customers see them before booking (booking/travel-fee.ts)
        travel_fee: travelSummary(listing),
      },
    };
  }

  /** Cancellation policy from the vendor's active contract for this package (same choice as bookings). */
  private async cancellationPolicyFor(vendorId: string, listingId: string, categoryId?: string | null) {
    const contracts = await this.prisma.vendorContract.findMany({
      where: { vendor_id: vendorId, status: VendorContractStatus.ACTIVE },
      select: {
        version: true,
        applies_to_all: true,
        category_ids: true,
        field_values: true,
        listings: { where: { listing_id: listingId }, select: { listing_id: true } },
      },
    });
    const vc = pickContractForListing(contracts, listingId, categoryId);
    const key = (vc?.field_values as Record<string, unknown> | null)?.cancellation_policy as string | undefined;
    const preset = key ? CANCELLATION_PRESETS[key] : undefined;
    return preset && key ? { key, label: preset.label, text: preset.text } : null;
  }

  /** Looks a vendor up by id or by shop handle (vendlymarketplace.com/v/<handle>). */
  async getVendorProfile(idOrHandle: string) {
    const vendor = await this.prisma.user.findFirst({
      where: {
        // a suspended or deleted vendor's shop isn't shown
        AND: [ACTIVE_VENDOR_WHERE, { OR: [{ id: idOrHandle }, { vendorProfile: { handle: idOrHandle.toLowerCase() } }] }],
      },
      select: {
        id: true,
        name: true,
        avatar: true,
        bio: true,
        location: true,
        created_at: true,
        is_test: true,
        vendorProfile: {
          select: {
            business_name: true,
            about_me: true,
            license_status: true,
            handle: true,
            banner: true,
            logo: true,
            ...SOCIALS_SELECT,
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
        // social accounts as full links (checked when saved)
        socials: readSocials(vendor.vendorProfile),
        avatar_url: vendor.avatar
          ? TanvirStorage.url(
              `${appConfig().storageUrl.avatar}/${vendor.avatar}`,
            )
          : null,
        avg_rating: avgRating._avg.rating,
        vendorListings: vendor.vendorListings.map((l) => ({
          ...this.formatListingCard(l),
          is_test: vendor.is_test,
        })),
      },
    };
  }

  async getCategories() {
    const categories = await this.prisma.serviceCategory.findMany({
      include: {
        sub_categories: { select: { id: true, name: true } },
        _count: { select: { vendor_listings: { where: liveListingWhere() } } },
      },
      orderBy: { name: 'asc' },
    });
    return { success: true, data: categories };
  }

  /**
   * Days a package can't be booked: the vendor's manual blocks plus busy time imported from their own
   * calendar. `working_hours` (top level, beside `data`) are the vendor's weekly hours.
   */
  async getBlockedDates(listingId: string) {
    const [blocks, listing] = await Promise.all([
      this.prisma.listingAvailability.findMany({
        where: { listing_id: listingId },
        select: { id: true, start_date: true, end_date: true, reason: true },
        orderBy: { start_date: 'asc' },
      }),
      this.prisma.vendorListing.findUnique({
        where: { id: listingId },
        select: { vendor_id: true, vendor: { select: { vendorProfile: { select: { working_hours: true } } } } },
      }),
    ]);
    // imported busy time covers all the vendor's packages; only the days are shared, never what the event was
    const busy = listing
      ? await this.prisma.calendarBusyBlock.findMany({
          where: { user_id: listing.vendor_id, end_date: { gte: todayUtc() } },
          select: { start_date: true, end_date: true },
          orderBy: { start_date: 'asc' },
        })
      : [];
    const imported = mergeDayRanges(busy).map((r) => ({
      id: `calendar-${r.start_date.toISOString().slice(0, 10)}`,
      start_date: r.start_date,
      end_date: r.end_date,
      reason: null,
      source: 'calendar' as const,
    }));
    const data = [...blocks.map((b) => ({ ...b, source: 'manual' as const })), ...imported].sort(
      (a, b) => a.start_date.getTime() - b.start_date.getTime(),
    );
    // the vendor's weekly hours: closed days and the hours a booking has to fit in (null = not set)
    const working_hours = readWorkingHours(listing?.vendor?.vendorProfile?.working_hours);
    return { success: true, data, working_hours, working_hours_summary: summariseWorkingHours(working_hours) };
  }

  async getFeaturedListings() {
    const listings = await this.prisma.vendorListing.findMany({
      where: liveListingWhere(),
      take: 8,
      orderBy: { created_at: 'desc' },
      include: {
        category: { select: { id: true, name: true, default_payment_plan: true } },
        vendor: {
          select: {
            id: true,
            name: true,
            avatar: true,
            is_test: true,
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
      // positions only drive near me here; never sent out (a vendor may have pinned their home)
      ...(withoutPosition(listing) as any),
      // a test vendor's package (Admin -> Settings -> Test vendors): the apps show a "Test" badge
      is_test: !!listing.vendor?.is_test,
      // what the customer will be asked to pay and when (vendor's choice, else the category default)
      effective_payment_plan: listing.payment_plan ?? listing.category?.default_payment_plan ?? 'FULL_ON_ACCEPT',
      // the same in words, with a custom deposit's own numbers (customer-facing: "the vendor accepts")
      payment_plan_label: planLabel(listing.payment_plan ?? listing.category?.default_payment_plan ?? PaymentPlan.FULL_ON_ACCEPT, listing).replace('when you accept', 'when the vendor accepts'),
      // what booking it asks for: a service address (not for venues or the vendor's place), a guest count (venues)
      ...bookingNeeds(listing),
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
    const { add_ons: links, option_groups: groups, ...rest } = listing;
    const offered = ((links ?? []) as any[]).map((l) => formatAddOn(l.add_on));
    const formatted = {
      ...this.formatListingCard(rest),
      // extras customers can pick when booking, and fees the vendor may charge after the job (shown up front)
      add_ons: offered.filter((a) => a.kind === 'ADD_ON'),
      fees: offered.filter((a) => a.kind === 'FEE'),
      // dropdowns the customer answers when booking ("Style": Knotless, Miracle knots…)
      customizations: formatOptionGroups(groups, listing.price_unit),
    };
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
