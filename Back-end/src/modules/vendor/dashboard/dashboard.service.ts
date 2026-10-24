import { Injectable } from '@nestjs/common';
import { BookingStatus } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import appConfig from 'src/config/app.config';
import { MAX_MONTHS, monthKeys, readZone, summariseEarnings } from './dashboard-stats';

const DAY = 24 * 3600 * 1000;

@Injectable()
export class VendorDashboardService {
  constructor(private prisma: PrismaService) {}

  /** Business dashboard: earned by month, bookings by status, upcoming, rating and top clients. */
  async stats(vendorId: string, query: { months?: number; tz?: string } = {}, now = new Date()) {
    const months = Math.min(MAX_MONTHS, Math.max(1, Math.floor(Number(query.months) || 12)));
    const zone = readZone(query.tz);
    const keys = monthKeys(months, now, zone);
    const [y, m] = keys[0].split('-').map(Number);
    // a day before the first month, so its local start is covered in any time zone
    const from = new Date(Date.UTC(y, m - 1, 1) - DAY);

    const [byStatus, upcoming, rating, bookings] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ['status'],
        where: { vendor_id: vendorId, deleted_at: null },
        _count: { _all: true },
      }),
      // confirmed bookings still to happen, and ones under way
      this.prisma.booking.count({
        where: {
          vendor_id: vendorId,
          deleted_at: null,
          OR: [
            { status: BookingStatus.IN_PROGRESS },
            {
              status: BookingStatus.CONFIRMED,
              OR: [{ event_start_at: { gte: now } }, { event_start_at: null, scheduled_at: { gte: now } }, { event_start_at: null, scheduled_at: null }],
            },
          ],
        },
      }),
      this.prisma.review.aggregate({ where: { vendor_id: vendorId, deleted_at: null }, _avg: { rating: true }, _count: { _all: true } }),
      // only bookings whose money could have reached the vendor in the window
      this.prisma.booking.findMany({
        where: {
          vendor_id: vendorId,
          OR: [{ released_at: { gte: from } }, { payout_credited_at: { gte: from } }, { cancelled_at: { gte: from } }, { paid_at: { gte: from } }],
        },
        select: {
          id: true,
          status: true,
          amount: true,
          paid_at: true,
          released_at: true,
          payout_credited_at: true,
          cancelled_at: true,
          created_at: true,
          commission_amount: true,
          released_gross: true,
          early_released_amount: true,
          customer_id: true,
          customer: { select: { id: true, name: true, avatar: true } },
          installments: { select: { status: true, amount: true, fee_amount: true, refunded_amount: true, paid_out_at: true } },
        },
      }),
    ]);

    const counts = Object.fromEntries(Object.values(BookingStatus).map((s) => [s, 0])) as Record<BookingStatus, number>;
    for (const row of byStatus) counts[row.status] = row._count._all;
    const earnings = summariseEarnings(bookings, keys, zone);
    const avatarUrl = (avatar: string | null) => (avatar ? TanvirStorage.url(`${appConfig().storageUrl.avatar}/${avatar}`) : null);

    return {
      success: true,
      data: {
        months,
        timezone: zone ?? 'UTC',
        revenue_by_month: earnings.revenue_by_month,
        total_earned: earnings.total_earned,
        bookings: {
          total: Object.values(counts).reduce((s, n) => s + n, 0),
          by_status: counts,
          upcoming,
        },
        rating: {
          average: rating._avg.rating != null ? Math.round(Number(rating._avg.rating) * 10) / 10 : null,
          count: rating._count._all,
        },
        top_clients: earnings.top_clients.map(({ avatar, ...c }) => ({ ...c, avatar_url: avatarUrl(avatar) })),
      },
    };
  }
}
