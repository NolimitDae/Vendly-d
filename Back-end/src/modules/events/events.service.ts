import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventStatus } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateBudgetItemDto,
  CreateEventDto,
  CreateEventTaskDto,
} from './dto/create-event.dto';
import { UpdateEventDto, UpdateTaskDto } from './dto/update-event.dto';

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
    await this.getEventOrFail(id, plannerId);

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
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });

    return { success: true, data: updated };
  }

  async cancel(id: string, plannerId: string) {
    await this.getEventOrFail(id, plannerId);

    const updated = await this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.CANCELLED },
    });

    return { success: true, data: updated };
  }

  async linkBooking(eventId: string, bookingId: string, plannerId: string) {
    await this.getEventOrFail(eventId, plannerId);

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
    await this.getEventOrFail(eventId, plannerId);

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
    await this.getEventOrFail(eventId, plannerId);

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
    await this.getEventOrFail(eventId, plannerId);

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

  private async getEventOrFail(id: string, plannerId: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.event_planner_id !== plannerId)
      throw new ForbiddenException('Access denied');
    return event;
  }
}
