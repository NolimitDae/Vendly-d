import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service';

describe('EventsService.create', () => {
  const prisma = {
    eventPlannerProfile: { findUnique: jest.fn() },
    event: { create: jest.fn() },
  };
  const service = new EventsService(prisma as any);
  const dto = { name: 'Okafor wedding', date: new Date('2026-06-14') } as any;

  beforeEach(() => jest.clearAllMocks());

  it('lets a verified planner create a client event', async () => {
    prisma.eventPlannerProfile.findUnique.mockResolvedValue({ license_status: 'APPROVED' });
    prisma.event.create.mockResolvedValue({ id: 'evt-1' });

    await expect(service.create('planner-1', dto)).resolves.toEqual({ success: true, data: { id: 'evt-1' } });
    expect(prisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event_planner_id: 'planner-1' }) }),
    );
  });

  it.each([
    ['pending verification', { license_status: 'PENDING' }],
    ['suspended', { license_status: 'SUSPENDED' }],
    ['without a planner profile', null],
  ])('refuses a planner %s', async (_label, profile) => {
    prisma.eventPlannerProfile.findUnique.mockResolvedValue(profile);

    await expect(service.create('planner-1', dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.event.create).not.toHaveBeenCalled();
  });
});

describe('EventsService.update (status changes and edits)', () => {
  const prisma = {
    event: { findUnique: jest.fn(), update: jest.fn() },
  };
  const service = new EventsService(prisma as any);
  const owned = (status: string) => ({ id: 'evt-1', event_planner_id: 'planner-1', status });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.event.update.mockImplementation(({ data }) => Promise.resolve({ id: 'evt-1', ...data }));
  });

  it.each([
    ['PLANNING', 'IN_PROGRESS'],
    ['CONFIRMED', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'COMPLETED'],
    ['PLANNING', 'CANCELLED'],
    ['IN_PROGRESS', 'CANCELLED'],
  ])('allows %s -> %s', async (from, to) => {
    prisma.event.findUnique.mockResolvedValue(owned(from));

    await expect(service.update('evt-1', 'planner-1', { status: to } as any)).resolves.toMatchObject({
      success: true,
      data: { id: 'evt-1', status: to },
    });
    const stamp =
      to === 'COMPLETED' ? { completed_at: expect.any(Date) } : to === 'CANCELLED' ? { cancelled_at: expect.any(Date) } : {};
    expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: 'evt-1' }, data: { status: to, ...stamp } });
  });

  it('stamps completed_at when the event is completed', async () => {
    prisma.event.findUnique.mockResolvedValue(owned('IN_PROGRESS'));
    const before = Date.now();
    await service.update('evt-1', 'planner-1', { status: 'COMPLETED' } as any);
    const data = prisma.event.update.mock.calls[0][0].data;
    expect(data.completed_at.getTime()).toBeGreaterThanOrEqual(before);
    expect(data.cancelled_at).toBeUndefined();
  });

  it('refuses to cancel a completed event with a clear message', async () => {
    prisma.event.findUnique.mockResolvedValue(owned('COMPLETED'));
    await expect(service.update('evt-1', 'planner-1', { status: 'CANCELLED' } as any)).rejects.toThrow(
      "This event is already completed, so it can't be cancelled.",
    );
    await expect(service.cancel('evt-1', 'planner-1')).rejects.toThrow("This event is already completed, so it can't be cancelled.");
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('does not re-stamp when the status is sent unchanged', async () => {
    prisma.event.findUnique.mockResolvedValue(owned('COMPLETED'));
    await service.update('evt-1', 'planner-1', { status: 'COMPLETED', notes: 'Great night' } as any);
    expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: 'evt-1' }, data: { status: 'COMPLETED', notes: 'Great night' } });
  });

  it.each([
    ['COMPLETED', 'PLANNING'],
    ['COMPLETED', 'IN_PROGRESS'],
    ['CANCELLED', 'PLANNING'],
    ['CANCELLED', 'IN_PROGRESS'],
    ['PLANNING', 'COMPLETED'],
    ['IN_PROGRESS', 'PLANNING'],
  ])('refuses %s -> %s', async (from, to) => {
    prisma.event.findUnique.mockResolvedValue(owned(from));

    await expect(service.update('evt-1', 'planner-1', { status: to } as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('refuses any edit to a cancelled event', async () => {
    prisma.event.findUnique.mockResolvedValue(owned('CANCELLED'));

    await expect(service.update('evt-1', 'planner-1', { name: 'New name' } as any)).rejects.toThrow(
      "This event was cancelled, so it can't be changed. You can still view everything on it.",
    );
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('only lets the event planner change the event', async () => {
    prisma.event.findUnique.mockResolvedValue(owned('PLANNING'));

    await expect(service.update('evt-1', 'someone-else', { status: 'IN_PROGRESS' } as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.cancel('evt-1', 'someone-else')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown event', async () => {
    prisma.event.findUnique.mockResolvedValue(null);

    await expect(service.update('nope', 'planner-1', { name: 'x' } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('saves edited details, including cleared optional fields, without touching the status', async () => {
    prisma.event.findUnique.mockResolvedValue(owned('PLANNING'));
    const date = new Date('2026-12-05T17:00:00Z');

    await service.update('evt-1', 'planner-1', {
      name: 'Okafor wedding reception',
      type: 'WEDDING',
      date,
      venue: null,
      guest_count: 180,
      notes: 'Outdoor',
    } as any);

    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { name: 'Okafor wedding reception', type: 'WEDDING', date, venue: null, guest_count: 180, notes: 'Outdoor' },
    });
  });

  it('cancel marks the event cancelled and does not touch its bookings', async () => {
    const prismaWithBookings = {
      event: { findUnique: jest.fn().mockResolvedValue(owned('PLANNING')), update: jest.fn().mockResolvedValue({ id: 'evt-1', status: 'CANCELLED' }) },
      booking: { update: jest.fn(), updateMany: jest.fn() },
      eventBooking: { deleteMany: jest.fn() },
    };
    const svc = new EventsService(prismaWithBookings as any);

    await expect(svc.cancel('evt-1', 'planner-1')).resolves.toEqual({ success: true, data: { id: 'evt-1', status: 'CANCELLED' } });
    expect(prismaWithBookings.event.update).toHaveBeenCalledWith({ where: { id: 'evt-1' }, data: { status: 'CANCELLED', cancelled_at: expect.any(Date) } });
    expect(prismaWithBookings.booking.update).not.toHaveBeenCalled();
    expect(prismaWithBookings.booking.updateMany).not.toHaveBeenCalled();
    expect(prismaWithBookings.eventBooking.deleteMany).not.toHaveBeenCalled();
  });

  it('cancelling an already-cancelled event keeps the first cancellation time', async () => {
    const first = new Date('2026-10-01T10:00:00Z');
    prisma.event.findUnique.mockResolvedValue({ ...owned('CANCELLED'), cancelled_at: first });
    await expect(service.cancel('evt-1', 'planner-1')).resolves.toMatchObject({ data: { status: 'CANCELLED', cancelled_at: first } });
    expect(prisma.event.update).not.toHaveBeenCalled();
  });
});

describe('EventsService on a cancelled event (read-only)', () => {
  const event = (status: string) => ({ id: 'evt-1', event_planner_id: 'planner-1', status });
  const prisma = {
    event: { findUnique: jest.fn() },
    eventTask: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
    budgetItem: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
  };
  const service = new EventsService(prisma as any);
  const READ_ONLY = "This event was cancelled, so it can't be changed. You can still view everything on it.";

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.event.findUnique.mockResolvedValue(event('CANCELLED'));
    prisma.eventTask.findFirst.mockResolvedValue({ id: 't1' });
    prisma.budgetItem.findFirst.mockResolvedValue({ id: 'b1' });
  });

  it.each([
    ['add a task', () => service.addTask('evt-1', 'planner-1', { title: 'Book DJ' } as any)],
    ['edit a task', () => service.updateTask('evt-1', 't1', 'planner-1', { completed: true } as any)],
    ['delete a task', () => service.deleteTask('evt-1', 't1', 'planner-1')],
    ['add a budget line', () => service.addBudgetItem('evt-1', 'planner-1', { category: 'Venue', allocated: 100 } as any)],
    ['edit a budget line', () => service.updateBudgetItem('evt-1', 'b1', 'planner-1', { spent: 50 } as any)],
    ['delete a budget line', () => service.deleteBudgetItem('evt-1', 'b1', 'planner-1')],
  ])("can't %s", async (_label, call) => {
    await expect(call()).rejects.toThrow(new BadRequestException(READ_ONLY));
    expect(prisma.eventTask.create).not.toHaveBeenCalled();
    expect(prisma.eventTask.update).not.toHaveBeenCalled();
    expect(prisma.eventTask.delete).not.toHaveBeenCalled();
    expect(prisma.budgetItem.create).not.toHaveBeenCalled();
    expect(prisma.budgetItem.update).not.toHaveBeenCalled();
    expect(prisma.budgetItem.delete).not.toHaveBeenCalled();
  });

  it('can still read the budget', async () => {
    prisma.budgetItem.findMany.mockResolvedValue([{ allocated: 100, spent: 40 }]);
    await expect(service.getBudget('evt-1', 'planner-1')).resolves.toMatchObject({ data: { total_allocated: 100, remaining: 60 } });
  });

  it('a completed event can still be edited', async () => {
    prisma.event.findUnique.mockResolvedValue(event('COMPLETED'));
    prisma.eventTask.create.mockResolvedValue({ id: 't2' });
    await expect(service.addTask('evt-1', 'planner-1', { title: 'Thank-you cards' } as any)).resolves.toEqual({ success: true, data: { id: 't2' } });
  });
});
