import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminPlannersService, plannerStatus, plannerStatusWhere } from './admin-planners.service';
import { accountStatusReason, accountStatusText, recordAccountStatus } from './account-status';
import { SignedUrl } from 'src/modules/contracts/private-storage';

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({
  TanvirStorage: { url: jest.fn((path: string) => `https://cdn.test/${path}`) },
}));

jest.mock('src/config/app.config', () => ({
  default: jest.fn(() => ({ app: { url: 'https://api.test' }, storageUrl: { avatar: 'avatars' } })),
}));

const planner = {
  id: 'p1',
  name: 'Jane Planner',
  first_name: 'Jane',
  last_name: 'Planner',
  email: 'jane@test.com',
  avatar: 'jane.png',
  created_at: new Date('2026-01-01'),
  status: 1,
  eventPlannerProfile: { business_name: 'Jane Events', event_types: ['WEDDING'], license_status: 'APPROVED' },
  _count: { plannedEvents: 4, customerBookings: 7 },
};

const makePrisma = () => ({
  user: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([planner]), findFirst: jest.fn() },
  event: { groupBy: jest.fn().mockResolvedValue([]) },
  booking: { findMany: jest.fn().mockResolvedValue([]) },
  notification: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
  notificationEvent: { create: jest.fn().mockResolvedValue({ id: 'ev1' }) },
});

describe('plannerStatus', () => {
  it('puts a suspended account first, then the licence', () => {
    expect(plannerStatus(0, 'APPROVED')).toBe('suspended');
    expect(plannerStatus(1, 'APPROVED')).toBe('approved');
    expect(plannerStatus(null, 'APPROVED')).toBe('approved');
    expect(plannerStatus(1, 'SUSPENDED')).toBe('rejected');
    expect(plannerStatus(1, 'PENDING')).toBe('pending');
    expect(plannerStatus(1, undefined)).toBe('pending');
  });

  it('filters active accounts including a null status', () => {
    const where: any = plannerStatusWhere('approved');
    expect(where.AND[0]).toEqual({ OR: [{ status: null }, { status: { not: 0 } }] });
    expect(plannerStatusWhere('suspended')).toEqual({ status: 0 });
  });
});

describe('AdminPlannersService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminPlannersService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AdminPlannersService(prisma as any);
  });

  it('lists planners with their status, counts and avatar link', async () => {
    const res = await service.list({ limit: 50 });
    expect(res.data[0]).toMatchObject({
      id: 'p1',
      name: 'Jane Planner',
      avatar: 'https://cdn.test/avatars/jane.png',
      planner_status: 'approved',
      business_name: 'Jane Events',
      total_events: 4,
      total_bookings: 7,
    });
    expect(res.counts).toEqual({ approved: 1, pending: 1, suspended: 1, rejected: 1 });
    expect(prisma.user.findMany.mock.calls[0][0].take).toBe(50);
  });

  it('applies the status filter and search', async () => {
    await service.list({ status: 'suspended', search: ' jane ' });
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ status: 0 });
    expect(JSON.stringify(where)).toContain('"contains":"jane"');
  });

  it('refuses an unknown status', async () => {
    await expect(service.list({ status: 'deleted' })).rejects.toThrow(BadRequestException);
  });

  it('caps the page size', async () => {
    await service.list({ limit: 5000 });
    expect(prisma.user.findMany.mock.calls[0][0].take).toBe(200);
  });

  describe('detail', () => {
    it('is not found for someone who is not a planner', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.detail('x', 'admin-1')).rejects.toThrow(NotFoundException);
    });

    it('returns profile, documents, events, bookings and history', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...planner,
        status: 0,
        phone_number: null,
        location: 'Austin',
        id_verified_at: new Date(),
        eventPlannerProfile: {
          business_name: 'Jane Events',
          bio: 'Weddings',
          website: null,
          instagram: null,
          event_types: ['WEDDING'],
          years_experience: 5,
          team_size: 3,
          license_status: 'APPROVED',
          approved_at: new Date('2026-02-01'),
          created_at: new Date('2026-01-15'),
          portfolio: ['a.jpg'],
          license_photo: ['lic.pdf'],
        },
      });
      prisma.event.groupBy.mockResolvedValue([{ status: 'PLANNING', _count: { _all: 2 } }]);
      prisma.booking.findMany.mockResolvedValue([
        { id: 'b1', status: 'CONFIRMED', amount: '120.50', created_at: new Date(), scheduled_at: null, event_start_at: new Date('2026-05-01'), listing: { title: 'DJ set' }, vendor: { name: 'Dee', vendorProfile: { business_name: 'Dee Sounds' } } },
      ]);
      prisma.notification.findMany.mockResolvedValue([
        { created_at: new Date('2026-03-01'), sender: { name: 'Admin' }, notification_event: { type: 'account_suspended', text: accountStatusText(0, 'Fake reviews') } },
      ]);

      const { data } = await service.detail('p1', 'admin-1');
      expect(data.planner_status).toBe('suspended');
      // signed links for this admin, never public storage addresses
      expect(data.profile?.documents).toHaveLength(1);
      expect(data.profile?.documents[0]).toMatch(/\/api\/licence-files\//);
      expect(SignedUrl.verify(data.profile!.documents[0].split('/').pop()!)).toMatchObject({ key: 'licences/legacy/planner/lic.pdf', uid: 'admin-1', cid: 'p1' });
      expect(data.events).toEqual({ total: 4, by_status: { PLANNING: 2 } });
      expect(data.bookings.recent[0]).toMatchObject({ id: 'b1', amount: 120.5, title: 'DJ set', vendor: 'Dee Sounds' });
      expect(data.history.map((h) => h.event)).toEqual(['suspended', 'approved', 'applied', 'joined']);
      expect(data.history[0]).toMatchObject({ note: 'Fake reviews', by: 'Admin' });
    });
  });
});

describe('account status notes', () => {
  it('reads the reason back, or null when none was given', () => {
    expect(accountStatusReason(accountStatusText(0, 'Spam: repeated'))).toBe('Spam: repeated');
    expect(accountStatusReason(accountStatusText(0))).toBeNull();
    expect(accountStatusReason(accountStatusText(1, '  '))).toBeNull();
  });

  it('records the change in the user’s inbox, sent by the admin', async () => {
    const prisma = makePrisma();
    await recordAccountStatus(prisma as any, { userId: 'p1', adminId: 'a1', status: 0, reason: 'Fake reviews' });
    expect(prisma.notificationEvent.create).toHaveBeenCalledWith({
      data: { type: 'account_suspended', text: 'Your account was suspended: Fake reviews' },
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { receiver_id: 'p1', sender_id: 'a1', notification_event_id: 'ev1' },
    });
  });
});
