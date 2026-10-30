import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';

export interface PromoInput {
  code: string;
  description?: string;
  percent_off?: number | null;
  amount_off?: number | null;
  min_amount?: number | null;
  max_uses?: number | null;
  expires_at?: string | null;
  active?: boolean;
  once_per_customer?: boolean;
  first_booking_only?: boolean;
  /** a vendor's code: the packages it's for (empty = all of theirs) */
  listing_ids?: string[];
}

/** The package a code is being used on: a vendor's code only works on that vendor's packages. */
export interface PromoScope {
  vendorId: string;
  listingId: string;
}

/** A vendor's code takes at most this share off a price: the booking always has something to charge. */
export const VENDOR_MAX_PERCENT_OFF = 90;

type Db = PrismaService | Prisma.TransactionClient;

const round = (n: number) => Math.round(n * 100) / 100;
const normalise = (code: string) => String(code ?? '').trim().toUpperCase();

/** Discount a promo gives on a price. Pure so it can be unit-tested. A vendor's code leaves at least 10% of the price. */
export function promoDiscount(promo: { percent_off?: unknown; amount_off?: unknown; vendor_id?: string | null }, price: number) {
  const pct = promo.percent_off != null ? Number(promo.percent_off) : 0;
  const amt = promo.amount_off != null ? Number(promo.amount_off) : 0;
  const d = pct > 0 ? (price * pct) / 100 : amt;
  const most = promo.vendor_id ? (price * VENDOR_MAX_PERCENT_OFF) / 100 : price;
  return round(Math.max(0, Math.min(most, d)));
}

export const PROMO_NOT_THIS_VENDOR = 'That promo code isn’t for this vendor.';
export const PROMO_NOT_THIS_PACKAGE = 'That promo code doesn’t apply to this package.';

export const PROMO_ALREADY_USED = 'You’ve already used this code.';
export const PROMO_FIRST_BOOKING_ONLY = 'This code is for your first booking only.';

/**
 * Bookings that used up a once-per-customer code. A request the vendor declined or let expire, or one
 * cancelled before any money was taken, never went ahead, so the customer can use the code again.
 */
export function promoUsedWhere(customerId: string, code: string, excludeBookingId?: string): Prisma.BookingWhereInput {
  return {
    customer_id: customerId,
    promo_code: code,
    ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    NOT: [{ status: BookingStatus.REJECTED }, { status: BookingStatus.CANCELLED, paid_at: null }],
  };
}

/**
 * Earlier bookings that make this not the customer's first: any that went ahead or may still go ahead
 * (waiting requests count, or a first-booking code could be used on several requests at once). Declined,
 * expired and unpaid cancelled requests don't count.
 */
export function earlierBookingWhere(customerId: string, excludeBookingId?: string): Prisma.BookingWhereInput {
  return {
    customer_id: customerId,
    ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    NOT: [{ status: BookingStatus.REJECTED }, { status: BookingStatus.CANCELLED, paid_at: null }],
  };
}

@Injectable()
export class PromoService {
  constructor(private prisma: PrismaService) {}

  /**
   * Validates a code for a price without using it up. Throws with a customer-friendly message.
   * With the customer, also checks the once-per-customer and first-booking limits.
   */
  async quote(code: string, price: number, customerId?: string, now = new Date(), scope?: PromoScope) {
    const promo = await this.prisma.promoCode.findUnique({ where: { code: normalise(code) } });
    if (!promo || !promo.active) throw new BadRequestException('That promo code isn’t valid.');
    // a vendor's own code: only on their packages (the ones it names, if any)
    if (promo.vendor_id) {
      if (!scope || promo.vendor_id !== scope.vendorId) throw new BadRequestException(PROMO_NOT_THIS_VENDOR);
      if (promo.listing_ids.length && !promo.listing_ids.includes(scope.listingId)) throw new BadRequestException(PROMO_NOT_THIS_PACKAGE);
    }
    if (promo.expires_at && promo.expires_at < now) throw new BadRequestException('That promo code has expired.');
    if (promo.max_uses != null && promo.uses >= promo.max_uses) throw new BadRequestException('That promo code has been used up.');
    if (promo.min_amount != null && price < Number(promo.min_amount)) throw new BadRequestException(`That promo code needs a booking of at least $${Number(promo.min_amount).toFixed(2)}.`);
    if (customerId) await this.assertCustomerMayUse(this.prisma, promo, customerId);
    return { code: promo.code, discount: promoDiscount(promo, price) };
  }

  /** Per-customer limits. The booking being created is left out so it doesn't count against itself. */
  async assertCustomerMayUse(db: Db, promo: { code: string; once_per_customer?: boolean; first_booking_only?: boolean }, customerId: string, excludeBookingId?: string) {
    // "already used" first: it's the more specific answer when both limits apply
    if (promo.once_per_customer && (await db.booking.findFirst({ where: promoUsedWhere(customerId, promo.code, excludeBookingId), select: { id: true } }))) {
      throw new BadRequestException(PROMO_ALREADY_USED);
    }
    if (promo.first_booking_only && (await db.booking.findFirst({ where: earlierBookingWhere(customerId, excludeBookingId), select: { id: true } }))) {
      throw new BadRequestException(PROMO_FIRST_BOOKING_ONLY);
    }
  }

  /**
   * Uses one redemption inside the booking transaction; fails if the last use was just taken.
   * With the customer and their new booking, the per-customer limits are checked again here, after the
   * code's row is locked, so two requests sent at once can't both use a once-per-customer code.
   */
  async redeem(tx: Prisma.TransactionClient, code: string, customer?: { customerId: string; bookingId: string }) {
    const p = await tx.promoCode.findUnique({ where: { code: normalise(code) } });
    if (!p || !p.active || (p.max_uses != null && p.uses >= p.max_uses)) throw new BadRequestException('That promo code has just been used up.');
    // optimistic: only counts if nobody else redeemed it since we read it
    const claimed = await tx.promoCode.updateMany({ where: { id: p.id, uses: p.uses }, data: { uses: { increment: 1 } } });
    if (claimed.count !== 1) throw new BadRequestException('That promo code has just been used up.');
    if (customer) await this.assertCustomerMayUse(tx, p, customer.customerId, customer.bookingId);
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  private validate(input: PromoInput, vendor = false) {
    const pct = input.percent_off != null && input.percent_off !== ('' as any) ? Number(input.percent_off) : null;
    const amt = input.amount_off != null && input.amount_off !== ('' as any) ? Number(input.amount_off) : null;
    if ((pct == null) === (amt == null)) throw new BadRequestException('Set either a percent off or an amount off.');
    if (pct != null && (pct <= 0 || pct > (vendor ? VENDOR_MAX_PERCENT_OFF : 100))) throw new BadRequestException(`Percent off must be between 0 and ${vendor ? VENDOR_MAX_PERCENT_OFF : 100}.`);
    if (amt != null && amt <= 0) throw new BadRequestException('Amount off must be more than zero.');
    const code = normalise(input.code);
    if (!/^[A-Z0-9_-]{3,50}$/.test(code)) throw new BadRequestException('Codes use 3–50 letters, numbers, dashes or underscores.');
    return {
      code,
      description: input.description?.trim() || null,
      percent_off: pct,
      amount_off: amt,
      min_amount: input.min_amount != null && input.min_amount !== ('' as any) ? Number(input.min_amount) : null,
      max_uses: input.max_uses != null && input.max_uses !== ('' as any) ? Number(input.max_uses) : null,
      expires_at: input.expires_at ? new Date(input.expires_at) : null,
      active: input.active ?? true,
      once_per_customer: input.once_per_customer === true,
      first_booking_only: input.first_booking_only === true,
    };
  }

  async list() {
    // vendors' own codes show whose they are
    return { success: true, data: await this.prisma.promoCode.findMany({ orderBy: { created_at: 'desc' }, include: { vendor: { select: { id: true, name: true, vendorProfile: { select: { business_name: true } } } } } }) };
  }

  async create(input: PromoInput) {
    const data = this.validate(input);
    const exists = await this.prisma.promoCode.findUnique({ where: { code: data.code } });
    if (exists) throw new BadRequestException('That code already exists.');
    return { success: true, data: await this.prisma.promoCode.create({ data }) };
  }

  async update(id: string, input: Partial<PromoInput>) {
    const current = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Promo code not found');
    const data = this.validate({
      code: input.code ?? current.code,
      description: input.description ?? current.description ?? undefined,
      percent_off: 'percent_off' in input ? input.percent_off : current.percent_off == null ? null : Number(current.percent_off),
      amount_off: 'amount_off' in input ? input.amount_off : current.amount_off == null ? null : Number(current.amount_off),
      min_amount: 'min_amount' in input ? input.min_amount : current.min_amount == null ? null : Number(current.min_amount),
      max_uses: 'max_uses' in input ? input.max_uses : current.max_uses,
      expires_at: 'expires_at' in input ? input.expires_at : current.expires_at?.toISOString() ?? null,
      active: input.active ?? current.active,
      once_per_customer: input.once_per_customer ?? current.once_per_customer,
      first_booking_only: input.first_booking_only ?? current.first_booking_only,
    });
    return { success: true, data: await this.prisma.promoCode.update({ where: { id }, data }) };
  }

  async remove(id: string) {
    await this.prisma.promoCode.update({ where: { id }, data: { active: false } });
    return { success: true };
  }

  // ─── Vendors' own codes ───────────────────────────────────────────────────

  /** The packages a vendor's code is for: their own, live or not, never anyone else's. */
  private async ownListings(vendorId: string, ids: unknown): Promise<string[]> {
    if (ids === undefined || ids === null) return [];
    if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string')) throw new BadRequestException('Choose the packages from your list.');
    const unique = [...new Set(ids as string[])];
    if (!unique.length) return [];
    const mine = await this.prisma.vendorListing.count({ where: { id: { in: unique }, vendor_id: vendorId, deleted_at: null } });
    if (mine !== unique.length) throw new BadRequestException('Choose the packages from your list.');
    return unique;
  }

  private async ownCode(vendorId: string, id: string) {
    const current = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!current || current.vendor_id !== vendorId) throw new NotFoundException('Promo code not found');
    return current;
  }

  /** A vendor's codes, with how many bookings used each. */
  async listForVendor(vendorId: string) {
    return { success: true, data: await this.prisma.promoCode.findMany({ where: { vendor_id: vendorId }, orderBy: { created_at: 'desc' } }) };
  }

  async createForVendor(vendorId: string, input: PromoInput) {
    const data = this.validate(input, true);
    const listing_ids = await this.ownListings(vendorId, input.listing_ids);
    if (await this.prisma.promoCode.findUnique({ where: { code: data.code } })) throw new BadRequestException('That code is already taken. Try another one.');
    return { success: true, data: await this.prisma.promoCode.create({ data: { ...data, vendor_id: vendorId, listing_ids } }) };
  }

  async updateForVendor(vendorId: string, id: string, input: Partial<PromoInput>) {
    const current = await this.ownCode(vendorId, id);
    const data = this.validate(
      {
        code: input.code ?? current.code,
        description: 'description' in input ? input.description : current.description ?? undefined,
        percent_off: 'percent_off' in input ? input.percent_off : current.percent_off == null ? null : Number(current.percent_off),
        amount_off: 'amount_off' in input ? input.amount_off : current.amount_off == null ? null : Number(current.amount_off),
        min_amount: 'min_amount' in input ? input.min_amount : current.min_amount == null ? null : Number(current.min_amount),
        max_uses: 'max_uses' in input ? input.max_uses : current.max_uses,
        expires_at: 'expires_at' in input ? input.expires_at : current.expires_at?.toISOString() ?? null,
        active: input.active ?? current.active,
        once_per_customer: input.once_per_customer ?? current.once_per_customer,
        first_booking_only: input.first_booking_only ?? current.first_booking_only,
      },
      true,
    );
    if (data.code !== current.code && (await this.prisma.promoCode.findUnique({ where: { code: data.code } }))) {
      throw new BadRequestException('That code is already taken. Try another one.');
    }
    const listing_ids = 'listing_ids' in input ? await this.ownListings(vendorId, input.listing_ids) : current.listing_ids;
    return { success: true, data: await this.prisma.promoCode.update({ where: { id }, data: { ...data, listing_ids } }) };
  }

  /** Turned off, not deleted: bookings that used it still name it. */
  async removeForVendor(vendorId: string, id: string) {
    await this.ownCode(vendorId, id);
    await this.prisma.promoCode.update({ where: { id }, data: { active: false } });
    return { success: true };
  }
}
