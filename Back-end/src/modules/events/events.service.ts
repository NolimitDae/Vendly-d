import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ADMIN_APPROVE_STATUS, BookingStatus, EventStatus } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import appConfig from 'src/config/app.config';
import {
  CreateBudgetItemDto,
  CreateEventDto,
  CreateEventTaskDto,
} from './dto/create-event.dto';
import { UpdateBudgetItemDto, UpdateEventDto, UpdateTaskDto } from './dto/update-event.dto';
import { assertNotCancelled, COMPLETED_CANT_CANCEL } from './event-rules';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async list(
    plannerId: string,
    query: { page?: number; limit?: number; status?: EventStatus },
  ) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    const skip = (page - 1) * limit;

    const where = {
      event_planner_id: plannerId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, events] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          _count: { select: { bookings: true, tasks: true, budget_items: true } },
        },
      }),
    ]);

    return {
      success: true,
      data: events,
      meta: { total, page, limit, last_page: Math.ceil(total / limit) },
    };
  }

  async create(plannerId: string, dto: CreateEventDto) {
    // Brief: planners are verified by Vendly before they can create client events.
    const profile = await this.prisma.eventPlannerProfile.findUnique({
      where: { user_id: plannerId },
      select: { license_status: true },
    });
    if (profile?.license_status !== ADMIN_APPROVE_STATUS.APPROVED) {
      throw new ForbiddenException(
        'Your planner account must be verified by Vendly before you can create client events.',
      );
    }

    const event = await this.prisma.event.create({
      data: {
        event_planner_id: plannerId,
        name: dto.name,
        type: dto.type,
        date: dto.date,
        venue: dto.venue,
        guest_count: dto.guest_count,
        total_budget: dto.total_budget,
        notes: dto.notes,
        status: EventStatus.PLANNING,
      },
    });

    return { success: true, data: event };
  }

  async findOne(id: string, plannerId: string) {
    await this.getEventOrFail(id, plannerId);

    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        bookings: {
          include: {
            booking: {
              include: {
                vendor: { select: { id: true, name: true, avatar: true } },
                listing: { select: { id: true, title: true, price: true, images: true } },
              },
            },
          },
        },
        budget_items: { orderBy: { created_at: 'asc' } },
        tasks: { orderBy: { due_date: 'asc' } },
      },
    });

    return { success: true, data: event };
  }

  async update(id: string, plannerId: string, dto: UpdateEventDto) {
    const event = await this.getEventOrFail(id, plannerId);

    assertNotCancelled(event);

    const changingStatus = dto.status !== undefined && dto.status !== event.status;
    if (changingStatus) {
      if (event.status === EventStatus.COMPLETED && dto.status === EventStatus.CANCELLED) {
        throw new BadRequestException(COMPLETED_CANT_CANCEL);
      }
      const valid: Partial<Record<EventStatus, EventStatus[]>> = {
        [EventStatus.PLANNING]: [EventStatus.CONFIRMED, EventStatus.IN_PROGRESS, EventStatus.CANCELLED],
        [EventStatus.CONFIRMED]: [EventStatus.IN_PROGRESS, EventStatus.CANCELLED],
        [EventStatus.IN_PROGRESS]: [EventStatus.COMPLETED, EventStatus.CANCELLED],
      };
      const allowed = valid[event.status] ?? [];
      if (!allowed.includes(dto.status!)) {
        throw new BadRequestException(
          `Cannot transition from ${event.status} to ${dto.status}`,
        );
      }
    }

    const updated = await this.prisma.event.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.date !== undefined && { date: dto.date }),
        ...(dto.venue !== undefined && { venue: dto.venue }),
        ...(dto.guest_count !== undefined && { guest_count: dto.guest_count }),
        ...(dto.total_budget !== undefined && { total_budget: dto.total_budget }),
        ...(dto.status !== undefined && { status: dto.status }),
        // when it happened, for the "Completed on …" banner and reports
        ...(changingStatus && dto.status === EventStatus.COMPLETED && { completed_at: new Date() }),
        ...(changingStatus && dto.status === EventStatus.CANCELLED && { cancelled_at: new Date() }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });

    return { success: true, data: updated };
  }

  async cancel(id: string, plannerId: string) {
    const event = await this.getEventOrFail(id, plannerId);
    if (event.status === EventStatus.COMPLETED) throw new BadRequestException(COMPLETED_CANT_CANCEL);
    // cancelling twice keeps the first cancellation time
    if (event.status === EventStatus.CANCELLED) return { success: true, data: event };

    const updated = await this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.CANCELLED, cancelled_at: new Date() },
    });

    return { success: true, data: updated };
  }

  async linkBooking(eventId: string, bookingId: string, plannerId: string) {
    assertNotCancelled(await this.getEventOrFail(eventId, plannerId));

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, customer_id: plannerId },
    });
    if (!booking) throw new NotFoundException('Booking not found or access denied');

    const linked = await this.prisma.eventBooking.upsert({
      where: { event_id_booking_id: { event_id: eventId, booking_id: bookingId } },
      create: { event_id: eventId, booking_id: bookingId },
      update: {},
    });

    return { success: true, data: linked };
  }

  async getBudget(eventId: string, plannerId: string) {
    await this.getEventOrFail(eventId, plannerId);

    const items = await this.prisma.budgetItem.findMany({
      where: { event_id: eventId },
      orderBy: { created_at: 'asc' },
    });

    const totalAllocated = items.reduce((sum, i) => sum + Number(i.allocated), 0);
    const totalSpent = items.reduce((sum, i) => sum + Number(i.spent), 0);

    return {
      success: true,
      data: {
        items,
        total_allocated: totalAllocated,
        total_spent: totalSpent,
        remaining: totalAllocated - totalSpent,
      },
    };
  }

  async addBudgetItem(eventId: string, plannerId: string, dto: CreateBudgetItemDto) {
    assertNotCancelled(await this.getEventOrFail(eventId, plannerId));

    const item = await this.prisma.budgetItem.create({
      data: {
        event_id: eventId,
        category: dto.category,
        allocated: dto.allocated,
        spent: dto.spent ?? 0,
        note: dto.note,
      },
    });

    return { success: true, data: item };
  }

  async addTask(eventId: string, plannerId: string, dto: CreateEventTaskDto) {
    assertNotCancelled(await this.getEventOrFail(eventId, plannerId));

    const task = await this.prisma.eventTask.create({
      data: {
        event_id: eventId,
        title: dto.title,
        due_date: dto.due_date,
      },
    });

    return { success: true, data: task };
  }

  async updateTask(
    eventId: string,
    taskId: string,
    plannerId: string,
    dto: UpdateTaskDto,
  ) {
    assertNotCancelled(await this.getEventOrFail(eventId, plannerId));

    const task = await this.prisma.eventTask.findFirst({
      where: { id: taskId, event_id: eventId },
    });
    if (!task) throw new NotFoundException('Task not found');

    const updated = await this.prisma.eventTask.update({
      where: { id: taskId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.due_date !== undefined && { due_date: dto.due_date }),
        ...(dto.completed !== undefined && { completed: dto.completed }),
      },
    });

    return { success: true, data: updated };
  }

  async updateBudgetItem(
    eventId: string,
    itemId: string,
    plannerId: string,
    dto: UpdateBudgetItemDto,
  ) {
    assertNotCancelled(await this.getEventOrFail(eventId, plannerId));

    const item = await this.prisma.budgetItem.findFirst({
      where: { id: itemId, event_id: eventId },
    });
    if (!item) throw new NotFoundException('Budget item not found');

    const updated = await this.prisma.budgetItem.update({
      where: { id: itemId },
      data: {
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.allocated !== undefined && { allocated: dto.allocated }),
        ...(dto.spent !== undefined && { spent: dto.spent }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
    });

    return { success: true, data: updated };
  }

  async deleteBudgetItem(eventId: string, itemId: string, plannerId: string) {
    assertNotCancelled(await this.getEventOrFail(eventId, plannerId));

    const item = await this.prisma.budgetItem.findFirst({
      where: { id: itemId, event_id: eventId },
    });
    if (!item) throw new NotFoundException('Budget item not found');

    await this.prisma.budgetItem.delete({ where: { id: itemId } });
    return { success: true };
  }

  async deleteTask(eventId: string, taskId: string, plannerId: string) {
    assertNotCancelled(await this.getEventOrFail(eventId, plannerId));

    const task = await this.prisma.eventTask.findFirst({
      where: { id: taskId, event_id: eventId },
    });
    if (!task) throw new NotFoundException('Task not found');

    await this.prisma.eventTask.delete({ where: { id: taskId } });
    return { success: true };
  }

  /**
   * "Rate your vendors": every completed booking the planner made on this event, with their review
   * if they left one. Ratings are sent one by one to POST /reviews (one review per booking).
   */
  async vendorReviews(eventId: string, plannerId: string) {
    const event = await this.getEventOrFail(eventId, plannerId);

    const links = await this.prisma.eventBooking.findMany({
      where: { event_id: eventId, booking: { customer_id: plannerId, status: BookingStatus.COMPLETED, deleted_at: null } },
      orderBy: { created_at: 'asc' },
      select: {
        booking: {
          select: {
            id: true,
            completed_at: true,
            listing: { select: { id: true, title: true, images: true, category: { select: { name: true } } } },
            vendor: { select: { id: true, name: true, avatar: true, vendorProfile: { select: { business_name: true } } } },
            review: { select: { id: true, rating: true, comment: true, created_at: true } },
          },
        },
      },
    });

    const items = links.map(({ booking: b }) => ({
      booking_id: b.id,
      completed_at: b.completed_at,
      listing: b.listing
        ? { id: b.listing.id, title: b.listing.title, category: b.listing.category?.name ?? null, image: b.listing.images?.[0] ? TanvirStorage.url(`listings/${b.listing.images[0]}`) : null }
        : null,
      vendor: {
        id: b.vendor.id,
        name: b.vendor.vendorProfile?.business_name || b.vendor.name || 'Vendor',
        avatar_url: b.vendor.avatar ? TanvirStorage.url(`${appConfig().storageUrl.avatar}/${b.vendor.avatar}`) : null,
      },
      review: b.review,
    }));

    return {
      success: true,
      data: { event: { id: event.id, name: event.name, status: event.status }, items, to_rate: items.filter((i) => !i.review).length },
    };
  }

  private async getEventOrFail(id: string, plannerId: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.event_planner_id !== plannerId)
      throw new ForbiddenException('Access denied');
    return event;
  }
}
