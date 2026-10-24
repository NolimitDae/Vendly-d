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
}

type Db = PrismaService | Prisma.TransactionClient;

const round = (n: number) => Math.round(n * 100) / 100;
const normalise = (code: string) => String(code ?? '').trim().toUpperCase();

/** Discount a promo gives on a price. Pure so it can be unit-tested. */
export function promoDiscount(promo: { percent_off?: unknown; amount_off?: unknown }, price: number) {
  const pct = promo.percent_off != null ? Number(promo.percent_off) : 0;
  const amt = promo.amount_off != null ? Number(promo.amount_off) : 0;
  const d = pct > 0 ? (price * pct) / 100 : amt;
  return round(Math.max(0, Math.min(price, d)));
}

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

/** Earlier bookings that went ahead (the vendor confirmed, or money was taken); waiting requests don't count. */
export function earlierBookingWhere(customerId: string, excludeBookingId?: string): Prisma.BookingWhereInput {
  return {
    customer_id: customerId,
    ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    OR: [{ status: { in: [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED] } }, { paid_at: { not: null } }],
  };
}

@Injectable()
export class PromoService {
  constructor(private prisma: PrismaService) {}

  /**
   * Validates a code for a price without using it up. Throws with a customer-friendly message.
   * With the customer, also checks the once-per-customer and first-booking limits.
   */
  async quote(code: string, price: number, customerId?: string, now = new Date()) {
    const promo = await this.prisma.promoCode.findUnique({ where: { code: normalise(code) } });
    if (!promo || !promo.active) throw new BadRequestException('That promo code isn’t valid.');
    if (promo.expires_at && promo.expires_at < now) throw new BadRequestException('That promo code has expired.');
    if (promo.max_uses != null && promo.uses >= promo.max_uses) throw new BadRequestException('That promo code has been used up.');
    if (promo.min_amount != null && price < Number(promo.min_amount)) throw new BadRequestException(`That promo code needs a booking of at least $${Number(promo.min_amount).toFixed(2)}.`);
    if (customerId) await this.assertCustomerMayUse(this.prisma, promo, customerId);
    return { code: promo.code, discount: promoDiscount(promo, price) };
  }

  /** Per-customer limits. The booking being created is left out so it doesn't count against itself. */
  async assertCustomerMayUse(db: Db, promo: { code: string; once_per_customer?: boolean; first_booking_only?: boolean }, customerId: string, excludeBookingId?: string) {
    if (promo.first_booking_only && (await db.booking.findFirst({ where: earlierBookingWhere(customerId, excludeBookingId), select: { id: true } }))) {
      throw new BadRequestException(PROMO_FIRST_BOOKING_ONLY);
    }
    if (promo.once_per_customer && (await db.booking.findFirst({ where: promoUsedWhere(customerId, promo.code, excludeBookingId), select: { id: true } }))) {
      throw new BadRequestException(PROMO_ALREADY_USED);
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

  private validate(input: PromoInput) {
    const pct = input.percent_off != null && input.percent_off !== ('' as any) ? Number(input.percent_off) : null;
    const amt = input.amount_off != null && input.amount_off !== ('' as any) ? Number(input.amount_off) : null;
    if ((pct == null) === (amt == null)) throw new BadRequestException('Set either a percent off or an amount off.');
    if (pct != null && (pct <= 0 || pct > 100)) throw new BadRequestException('Percent off must be between 0 and 100.');
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
    return { success: true, data: await this.prisma.promoCode.findMany({ orderBy: { created_at: 'desc' } }) };
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
}
