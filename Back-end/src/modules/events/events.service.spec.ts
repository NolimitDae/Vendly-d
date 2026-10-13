import { ForbiddenException } from '@nestjs/common';
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
