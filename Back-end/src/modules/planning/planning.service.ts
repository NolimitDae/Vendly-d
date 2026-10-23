import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventType, ListingStatus } from 'prisma/generated/client';
import { geocode, milesBetween } from 'src/modules/geo/geo';
import { DEFAULT_RADIUS_MILES, availableOnDayWhere, nearBoxWhere, withinReach } from 'src/modules/marketplace/marketplace.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { PlanChecklistDto } from './dto/checklist.dto';
import { buildChecklist, coveredBy, type ChecklistInput } from './planning-rules';

export interface Near {
  lat: number;
  lng: number;
  label: string | null;
}

/**
 * "Plan your event": which services an event usually needs, a budget split, when to book, and how
 * many vendors on Vendly are free that day near the event. Rules only (see planning-rules.ts).
 */
@Injectable()
export class PlanningService {
  private readonly logger = new Logger(PlanningService.name);

  constructor(private prisma: PrismaService) {}

  /** Public checklist from a short form. */
  async checklist(dto: PlanChecklistDto, today: Date = new Date()) {
    const near = await this.resolveNear(dto.lat, dto.lng, dto.location);
    const data = await this.plan(
      { event_type: dto.event_type, guest_count: dto.guest_count ?? null, budget: dto.budget ?? null, date: dto.date ?? null },
      near,
      dto.location?.trim() || null,
      today,
    );
    return { success: true, data };
  }

  /** The same checklist for a planner's event, with what is already covered (booked or budgeted). */
  async eventPlan(eventId: string, plannerId: string, today: Date = new Date()) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        event_planner_id: true,
        type: true,
        date: true,
        venue: true,
        guest_count: true,
        total_budget: true,
        status: true,
        bookings: { select: { booking: { select: { status: true, listing: { select: { category_id: true } } } } } },
        budget_items: { select: { category: true } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (event.event_planner_id !== plannerId) throw new ForbiddenException('Access denied');

    const date = event.date ? event.date.toISOString().slice(0, 10) : null;
    const near = await this.resolveNear(undefined, undefined, event.venue);
    const plan = await this.plan(
      {
        event_type: event.type ?? EventType.OTHER,
        guest_count: event.guest_count ?? null,
        budget: event.total_budget != null ? Number(event.total_budget) : null,
        date,
      },
      near,
      event.venue?.trim() || null,
      today,
    );
    const covered = {
      venue: event.venue,
      bookings: event.bookings.map((b) => ({ status: b.booking.status as string, category_id: b.booking.listing?.category_id })),
      budget_lines: event.budget_items.map((b) => b.category),
    };
    const items = plan.items.map((item) => {
      const by = coveredBy(item.category, covered);
      return { ...item, covered: !!by, covered_by: by };
    });
    return {
      success: true,
      data: {
        ...plan,
        event: { id: event.id, name: event.name, status: event.status, type_set: event.type != null },
        items,
        summary: { total: items.length, covered: items.filter((i) => i.covered).length },
      },
    };
  }

  private async plan(input: ChecklistInput, near: Near | null, location: string | null, today: Date) {
    const categories = await this.prisma.serviceCategory.findMany({ select: { id: true, name: true } });
    const draft = buildChecklist(input, categories, today);
    const counts = await this.availableCounts(
      draft.map((i) => i.category.id),
      input.date ?? null,
      near,
    );
    const items = draft.map((i) => ({
      ...i,
      available_vendors: counts[i.category.id] ?? 0,
      // what the apps turn into a marketplace search
      search: {
        category_id: i.category.id,
        date: input.date ?? null,
        near_lat: near?.lat ?? null,
        near_lng: near?.lng ?? null,
        radius_miles: near ? DEFAULT_RADIUS_MILES : null,
        location: near?.label ?? location,
      },
    }));
    const budgets = items.map((i) => i.suggested_budget).filter((n): n is number => n != null);
    return {
      event_type: input.event_type,
      guest_count: input.guest_count ?? null,
      budget: input.budget ?? null,
      date: input.date ?? null,
      near,
      location,
      radius_miles: DEFAULT_RADIUS_MILES,
      items,
      totals: { suggested_budget: budgets.length ? budgets.reduce((s, n) => s + n, 0) : null },
    };
  }

  /**
   * ACTIVE packages per category that can be booked that day (not blocked, vendor's calendar free) and,
   * with a position, within the default distance or the vendor's travel radius: the same rules as the
   * marketplace search.
   */
  async availableCounts(categoryIds: string[], date: string | null, near: Near | null): Promise<Record<string, number>> {
    if (!categoryIds.length) return {};
    const where: any = {
      status: ListingStatus.ACTIVE,
      deleted_at: null,
      category_id: { in: categoryIds },
      ...(date ? availableOnDayWhere(date) : {}),
    };
    const counts: Record<string, number> = {};
    if (near) {
      Object.assign(where, nearBoxWhere(near, DEFAULT_RADIUS_MILES));
      const rows = await this.prisma.vendorListing.findMany({
        where,
        select: { category_id: true, lat: true, lng: true, service_radius_miles: true },
      });
      for (const r of rows) {
        if (!r.category_id || r.lat == null || r.lng == null) continue;
        const miles = Math.round(milesBetween(near, { lat: r.lat, lng: r.lng }) * 10) / 10;
        if (withinReach(miles, DEFAULT_RADIUS_MILES, r.service_radius_miles)) counts[r.category_id] = (counts[r.category_id] ?? 0) + 1;
      }
      return counts;
    }
    // (cast: Prisma's groupBy generics don't accept a dynamic where)
    const listings = this.prisma.vendorListing as unknown as { groupBy: (args: unknown) => Promise<unknown> };
    const groups = (await listings.groupBy({ by: ['category_id'], where, _count: { _all: true } })) as {
      category_id: string | null;
      _count: { _all: number };
    }[];
    for (const g of groups) if (g.category_id) counts[g.category_id] = g._count._all;
    return counts;
  }

  /** A position from lat/lng, else the location text geocoded (null when it can't be found: no distance filter). */
  private async resolveNear(lat: number | undefined, lng: number | undefined, text: string | null | undefined): Promise<Near | null> {
    const label = text?.trim() || null;
    if (lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) return { lat: Number(lat), lng: Number(lng), label };
    if (!label) return null;
    try {
      const point = await geocode(label);
      return point ? { ...point, label } : null;
    } catch (e) {
      this.logger.warn(`Plan location lookup failed: ${(e as Error).message}`);
      return null;
    }
  }
}
