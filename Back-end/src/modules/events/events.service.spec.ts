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

    await expect(service.update('evt-1', 'planner-1', { status: to } as any)).resolves.toEqual({
      success: true,
      data: { id: 'evt-1', status: to },
    });
    expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: 'evt-1' }, data: { status: to } });
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

    await expect(service.update('evt-1', 'planner-1', { name: 'New name' } as any)).rejects.toBeInstanceOf(
      BadRequestException,
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
    expect(prismaWithBookings.event.update).toHaveBeenCalledWith({ where: { id: 'evt-1' }, data: { status: 'CANCELLED' } });
    expect(prismaWithBookings.booking.update).not.toHaveBeenCalled();
    expect(prismaWithBookings.booking.updateMany).not.toHaveBeenCalled();
    expect(prismaWithBookings.eventBooking.deleteMany).not.toHaveBeenCalled();
  });
});
