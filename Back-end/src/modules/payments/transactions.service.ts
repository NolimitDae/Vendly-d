import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { bookingTitle } from './money-text';
import { customerLedger, filterLedger, LedgerBooking, LedgerTransaction, LedgerType, ledgerTotals, VENDOR_TX_TYPES, vendorLedger } from './transactions';

export interface TransactionsQuery {
  type?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number | string;
  limit?: number | string;
  /** whose ledger: the signed-in user's bookings as a customer or as a vendor (default from their role) */
  role?: string;
}

const TYPES = ['all', 'payment', 'refund', 'payout', 'fee'] as const;
/** Enough history for any one account's screen; older rows are still in the earnings report. */
const MAX_BOOKINGS = 1000;

function parseDate(v: string | undefined, endOfDay: boolean): Date | null {
  if (!v) return null;
  // a bare day ("2026-10-01") covers that whole day
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : v);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`"${v}" is not a date.`);
  return d;
}

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async list(user: { id: string; type?: string | null }, query: TransactionsQuery) {
    const type = (query.type ?? 'all') as (typeof TYPES)[number];
    if (!TYPES.includes(type)) throw new BadRequestException(`type must be one of ${TYPES.join(', ')}`);
    const role = query.role === 'vendor' || query.role === 'customer' ? query.role : user.type === 'VENDOR' ? 'vendor' : 'customer';
    const page = Math.max(1, Math.floor(Number(query.page ?? 1)) || 1);
    const limit = Math.min(100, Math.max(1, Math.floor(Number(query.limit ?? 20)) || 20));

    const rows = role === 'vendor' ? await this.vendorRows(user.id) : await this.customerRows(user.id);
    const filtered = filterLedger(rows, { type: type as 'all' | LedgerType, from: parseDate(query.from, false), to: parseDate(query.to, true), q: query.q });
    const total = filtered.length;
    return {
      success: true,
      data: filtered.slice((page - 1) * limit, page * limit),
      meta: { total, page, limit, last_page: Math.max(1, Math.ceil(total / limit)), role },
      totals: ledgerTotals(filtered),
    };
  }

  private bookingSelect() {
    return {
      id: true, status: true, amount: true, service_fee: true, currency: true, paid_at: true, released_at: true, payout_credited_at: true, transfer_id: true,
      listing: { select: { title: true } },
      rental_reservations: { select: { item: { select: { title: true } } } },
      customer: { select: { name: true } },
      installments: {
        orderBy: { sequence: 'asc' as const },
        select: { id: true, label: true, kind: true, status: true, amount: true, fee_amount: true, refunded_amount: true, capture_manually: true, paid_at: true, paid_out_at: true, updated_at: true, attempts: true, extra: { select: { kind: true } } },
      },
    };
  }

  private toLedgerBooking(b: any, withCustomer: boolean): LedgerBooking {
    return {
      id: b.id,
      title: bookingTitle(b),
      status: b.status,
      amount: b.amount,
      service_fee: b.service_fee,
      currency: b.currency,
      paid_at: b.paid_at,
      released_at: b.released_at,
      payout_credited_at: b.payout_credited_at,
      customer_name: withCustomer ? b.customer?.name ?? null : null,
      // a charge that was never tried isn't history yet
      installments: b.installments.filter((i: any) => i.status !== 'SCHEDULED' && i.status !== 'CANCELLED' && !(i.status === 'FAILED' && !i.attempts)),
    };
  }

  private async customerRows(userId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { customer_id: userId, OR: [{ paid_at: { not: null } }, { installments: { some: { status: { not: 'SCHEDULED' } } } }] },
      select: this.bookingSelect(),
      orderBy: { created_at: 'desc' },
      take: MAX_BOOKINGS,
    });
    // refunds on bookings paid through hosted Checkout (no installments) are only transaction rows
    const legacy = await this.prisma.paymentTransaction.findMany({
      where: { user_id: userId, type: 'booking_refund', status: 'refunded' },
      select: { id: true, created_at: true, type: true, status: true, amount: true, currency: true, order_id: true },
      orderBy: { created_at: 'desc' },
      take: MAX_BOOKINGS,
    });
    const legacyIds = new Set(bookings.filter((b) => !b.installments.length).map((b) => b.id));
    // rows linked to a booking with installments are already counted from the installments
    const refunds: LedgerTransaction[] = legacy
      .filter((t) => !t.order_id || legacyIds.has(t.order_id))
      .map((t) => ({ id: t.id, created_at: t.created_at, type: t.type, status: t.status, amount: t.amount, currency: t.currency, booking_id: t.order_id ?? null }));
    return customerLedger(bookings.map((b) => this.toLedgerBooking(b, false)), refunds);
  }

  private async vendorRows(userId: string) {
    const [bookings, txs] = await Promise.all([
      this.prisma.booking.findMany({
        where: { vendor_id: userId, paid_at: { not: null } },
        select: this.bookingSelect(),
        orderBy: { created_at: 'desc' },
        take: MAX_BOOKINGS,
      }),
      this.prisma.paymentTransaction.findMany({
        where: { user_id: userId, type: { in: VENDOR_TX_TYPES } },
        select: { id: true, created_at: true, type: true, status: true, amount: true, currency: true, order_id: true, reference_number: true },
        orderBy: { created_at: 'desc' },
        take: 5 * MAX_BOOKINGS,
      }),
    ]);
    // which booking each transaction belongs to: order_id on new rows; older rows carry the booking id or the transfer id as their reference
    const ids = new Set(bookings.map((b) => b.id));
    const byTransfer = new Map(bookings.filter((b) => b.transfer_id).map((b) => [b.transfer_id as string, b.id]));
    const unknownRefs = [...new Set(txs.filter((t) => !t.order_id && t.reference_number && !ids.has(t.reference_number) && !byTransfer.has(t.reference_number)).map((t) => t.reference_number as string))];
    if (unknownRefs.length) {
      // a booking id from a booking not loaded above (e.g. not paid through the app)
      const more = await this.prisma.booking.findMany({ where: { vendor_id: userId, id: { in: unknownRefs } }, select: this.bookingSelect() });
      for (const b of more) {
        ids.add(b.id);
        bookings.push(b);
      }
    }
    const linked: LedgerTransaction[] = txs.map((t) => {
      const ref = t.reference_number ?? '';
      const bookingId = t.order_id ?? (ids.has(ref) ? ref : byTransfer.get(ref) ?? null);
      return { id: t.id, created_at: t.created_at, type: t.type, status: t.status, amount: t.amount, currency: t.currency, booking_id: bookingId };
    });
    return vendorLedger(bookings.map((b) => this.toLedgerBooking(b, true)), linked);
  }
}
