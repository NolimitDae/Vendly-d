import { BookingStatus } from 'prisma/generated/enums';
import type { PrismaService } from 'src/prisma/prisma.service';
import { UNTRACKED_VENDOR_REASONS } from './cancel-reasons';

/**
 * Vendor cancellation tracking (owner's rule, Oct 2026): cancellations a vendor makes for their own
 * reasons (not "Customer didn't pay", not a safety concern, never the system's non-payment ones) are
 * counted over a rolling 90 days. From 2, Vendly's admins are told once, and the vendor's packages
 * are shown after everyone else's in marketplace search while it stays at 2 or more.
 */
export const TRACK_WINDOW_DAYS = 90;
export const TRACK_THRESHOLD = 2;

const DAY = 24 * 3600 * 1000;

export const trackWindowStart = (now = new Date()) => new Date(now.getTime() - TRACK_WINDOW_DAYS * DAY);

/** Bookings that count against their vendor since `since`. Older apps sent no reason: those count. */
export function trackedCancellationWhere(since: Date) {
  return {
    status: BookingStatus.CANCELLED,
    cancelled_by: 'VENDOR',
    cancelled_at: { gte: since },
    OR: [{ cancel_reason_code: null }, { cancel_reason_code: { notIn: UNTRACKED_VENDOR_REASONS } }],
  };
}

/** How many cancellations count against each of these vendors in the last 90 days (missing = 0). */
export async function vendorCancellationCounts(prisma: PrismaService, vendorIds: string[], now = new Date()): Promise<Record<string, number>> {
  if (!vendorIds.length) return {};
  const rows = await prisma.booking.groupBy({
    by: ['vendor_id'],
    where: { ...trackedCancellationWhere(trackWindowStart(now)), vendor_id: { in: vendorIds } },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.vendor_id, r._count._all]));
}

/** Vendors at or over the threshold right now: their packages go after everyone else's in search. */
export async function penalisedVendorIds(prisma: PrismaService, now = new Date()): Promise<string[]> {
  const rows = await prisma.booking.groupBy({
    by: ['vendor_id'],
    where: trackedCancellationWhere(trackWindowStart(now)),
    _count: { _all: true },
    having: { vendor_id: { _count: { gte: TRACK_THRESHOLD } } },
  });
  return rows.map((r) => r.vendor_id);
}
