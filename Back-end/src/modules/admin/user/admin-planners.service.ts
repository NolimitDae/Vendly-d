import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from 'prisma/generated/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TanvirStorage } from '../../../common/lib/Disk/TanvirStorage';
import appConfig from '../../../config/app.config';
import { ACCOUNT_STATUS_TYPES, ACCOUNT_SUSPENDED, accountStatusReason } from './account-status';

/** Where a planner stands for the admin list: the account first (suspended), then their licence check. */
export const PLANNER_STATUSES = ['approved', 'pending', 'suspended', 'rejected'] as const;
export type PlannerStatus = (typeof PLANNER_STATUSES)[number];

export function plannerStatus(accountStatus: number | null | undefined, licenseStatus: string | null | undefined): PlannerStatus {
  if (accountStatus === 0) return 'suspended';
  if (licenseStatus === 'APPROVED') return 'approved';
  if (licenseStatus === 'SUSPENDED') return 'rejected';
  // no profile yet, or a licence waiting for review
  return 'pending';
}

// a null status is an active account (the column defaults to 1)
const ACTIVE: Prisma.UserWhereInput = { OR: [{ status: null }, { status: { not: 0 } }] };

/** The prisma filter matching plannerStatus() above. */
export function plannerStatusWhere(status: PlannerStatus): Prisma.UserWhereInput {
  switch (status) {
    case 'suspended':
      return { status: 0 };
    case 'approved':
      return { AND: [ACTIVE, { eventPlannerProfile: { is: { license_status: 'APPROVED' } } }] };
    case 'rejected':
      return { AND: [ACTIVE, { eventPlannerProfile: { is: { license_status: 'SUSPENDED' } } }] };
    case 'pending':
      return {
        AND: [
          ACTIVE,
          { OR: [{ eventPlannerProfile: { is: null } }, { eventPlannerProfile: { is: { license_status: { in: ['PENDING', 'NOT_APPLICABLE'] } } } }] },
        ],
      };
  }
}

// anyone who signed up as a planner, holds the role, or has a planner profile
const IS_PLANNER: Prisma.UserWhereInput = {
  deleted_at: null,
  OR: [{ type: 'EVENT_PLANNER' }, { roles: { has: 'EVENT_PLANNER' } }, { eventPlannerProfile: { isNot: null } }],
};

const avatarUrl = (avatar: string | null | undefined) =>
  avatar ? TanvirStorage.url(`${appConfig().storageUrl.avatar}/${avatar}`) : null;

const displayName = (u: { name?: string | null; first_name?: string | null; last_name?: string | null }) =>
  u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim();

/** Admin view of every event planner: list with status filter and search, and one planner's details. */
@Injectable()
export class AdminPlannersService {
  constructor(private prisma: PrismaService) {}

  async list(query: { status?: string; search?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit ?? 20) || 20));
    const status = query.status && query.status !== 'all' ? query.status : undefined;
    if (status && !PLANNER_STATUSES.includes(status as PlannerStatus)) {
      throw new BadRequestException('Choose approved, pending, suspended or rejected.');
    }

    const q = query.search?.trim().slice(0, 100);
    const search: Prisma.UserWhereInput | undefined = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { eventPlannerProfile: { is: { business_name: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : undefined;
    const base: Prisma.UserWhereInput[] = [IS_PLANNER, ...(search ? [search] : [])];
    const where: Prisma.UserWhereInput = { AND: [...base, ...(status ? [plannerStatusWhere(status as PlannerStatus)] : [])] };

    // counts per status (with the same search) for the filter tabs
    const [total, users, ...counts] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          name: true,
          first_name: true,
          last_name: true,
          email: true,
          avatar: true,
          created_at: true,
          status: true,
          eventPlannerProfile: { select: { business_name: true, event_types: true, license_status: true } },
          _count: { select: { plannedEvents: true, customerBookings: true } },
        },
      }),
      ...PLANNER_STATUSES.map((s) => this.prisma.user.count({ where: { AND: [...base, plannerStatusWhere(s)] } })),
    ]);

    const data = users.map((u) => ({
      id: u.id,
      name: displayName(u),
      email: u.email,
      avatar: avatarUrl(u.avatar),
      created_at: u.created_at,
      status: u.status ?? 1,
      planner_status: plannerStatus(u.status, u.eventPlannerProfile?.license_status),
      business_name: u.eventPlannerProfile?.business_name ?? null,
      event_types: u.eventPlannerProfile?.event_types ?? [],
      license_status: u.eventPlannerProfile?.license_status ?? null,
      total_events: u._count.plannedEvents,
      total_bookings: u._count.customerBookings,
    }));

    return {
      success: true,
      data,
      counts: Object.fromEntries(PLANNER_STATUSES.map((s, i) => [s, counts[i]])) as Record<PlannerStatus, number>,
      meta: { total, page, limit, last_page: Math.ceil(total / limit) },
    };
  }

  async detail(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { AND: [IS_PLANNER, { id: userId }] },
      select: {
        id: true,
        name: true,
        first_name: true,
        last_name: true,
        email: true,
        phone_number: true,
        avatar: true,
        location: true,
        created_at: true,
        status: true,
        id_verified_at: true,
        eventPlannerProfile: true,
        _count: { select: { plannedEvents: true, customerBookings: true } },
      },
    });
    if (!user) throw new NotFoundException('Event planner not found');

    const [eventsByStatus, bookings, statusNotes] = await Promise.all([
      this.prisma.event.groupBy({ by: ['status'], where: { event_planner_id: userId }, _count: { _all: true } }),
      this.prisma.booking.findMany({
        where: { customer_id: userId, deleted_at: null },
        orderBy: { created_at: 'desc' },
        take: 10,
        select: {
          id: true,
          status: true,
          amount: true,
          created_at: true,
          scheduled_at: true,
          event_start_at: true,
          listing: { select: { title: true } },
          vendor: { select: { name: true, vendorProfile: { select: { business_name: true } } } },
        },
      }),
      this.prisma.notification.findMany({
        where: { receiver_id: userId, notification_event: { type: { in: ACCOUNT_STATUS_TYPES } } },
        orderBy: { created_at: 'desc' },
        take: 20,
        select: { created_at: true, sender: { select: { name: true } }, notification_event: { select: { type: true, text: true } } },
      }),
    ]);

    const profile = user.eventPlannerProfile;
    // newest first: account suspensions and restores, licence approval, profile, sign-up
    const history = [
      ...statusNotes.map((n) => ({
        at: n.created_at,
        event: n.notification_event?.type === ACCOUNT_SUSPENDED ? 'suspended' : 'restored',
        note: accountStatusReason(n.notification_event?.text),
        by: n.sender?.name ?? null,
      })),
      ...(profile?.approved_at ? [{ at: profile.approved_at, event: 'approved', note: null, by: null }] : []),
      ...(profile ? [{ at: profile.created_at, event: 'applied', note: null, by: null }] : []),
      { at: user.created_at, event: 'joined', note: null, by: null },
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return {
      success: true,
      data: {
        id: user.id,
        name: displayName(user),
        email: user.email,
        phone: user.phone_number,
        location: user.location,
        avatar: avatarUrl(user.avatar),
        created_at: user.created_at,
        status: user.status ?? 1,
        id_verified: !!user.id_verified_at,
        planner_status: plannerStatus(user.status, profile?.license_status),
        profile: profile
          ? {
              business_name: profile.business_name,
              bio: profile.bio,
              website: profile.website,
              instagram: profile.instagram,
              event_types: profile.event_types,
              years_experience: profile.years_experience,
              team_size: profile.team_size,
              license_status: profile.license_status,
              approved_at: profile.approved_at,
              // the same storage links the pending-requests page shows
              portfolio: (profile.portfolio ?? []).map((f) => TanvirStorage.url(`event-planner/portfolio/${f}`)),
              documents: (profile.license_photo ?? []).map((f) => TanvirStorage.url(`event-planner/license/${f}`)),
            }
          : null,
        events: {
          total: user._count.plannedEvents,
          by_status: Object.fromEntries(eventsByStatus.map((e) => [e.status, e._count._all])),
        },
        bookings: {
          total: user._count.customerBookings,
          recent: bookings.map((b) => ({
            id: b.id,
            status: b.status,
            amount: b.amount != null ? Number(b.amount) : null,
            created_at: b.created_at,
            date: b.event_start_at ?? b.scheduled_at,
            title: b.listing?.title ?? null,
            vendor: b.vendor?.vendorProfile?.business_name || b.vendor?.name || null,
          })),
        },
        history,
      },
    };
  }
}
