import { NotFoundException } from '@nestjs/common';
import { SavedVendorsService } from './saved-vendors.service';

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({
  TanvirStorage: { url: jest.fn((path: string) => `https://storage.test/${path}`) },
}));

/** Just enough of Prisma's where-matching for the vendor filter (equals, null, not, OR, isNot). */
function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, cond]: [string, any]) => {
    if (key === 'OR') return (cond as any[]).some((c) => matches(row, c));
    const value = row?.[key];
    if (cond === null) return value == null;
    if (typeof cond !== 'object') return value === cond;
    if ('isNot' in cond) return cond.isNot === null ? value != null : !matches(value, cond.isNot);
    if ('not' in cond) return value !== cond.not;
    return matches(value, cond);
  });
}

const vendorRow = (id: string, extra: Record<string, any> = {}) => ({
  id,
  name: `Vendor ${id}`,
  email: `${id}@mail.test`,
  phone_number: '+15550100',
  avatar: `${id}.png`,
  location: 'Atlanta, GA',
  is_test: false,
  status: 1,
  deleted_at: null,
  vendorProfile: {
    business_name: `Shop ${id}`,
    handle: id,
    logo: null,
    business_address: '1 Private St',
    business_lat: 33.7,
    business_lng: -84.4,
  },
  vendorListings: [{ category: { name: 'Catering' } }],
  _count: { vendorListings: 2 },
  ...extra,
});

describe('SavedVendorsService', () => {
  let saved: { user_id: string; vendor_id: string; id: string; created_at: Date }[];
  let users: any[];
  let prisma: any;
  let service: SavedVendorsService;

  beforeEach(() => {
    users = [
      vendorRow('live'),
      vendorRow('suspended', { status: 0 }),
      vendorRow('deleted', { deleted_at: new Date() }),
      vendorRow('customer', { vendorProfile: null }),
    ];
    saved = users.map((u, i) => ({ id: `s${i}`, user_id: 'me', vendor_id: u.id, created_at: new Date(2026, 0, i + 1) }));
    prisma = {
      user: {
        findFirst: jest.fn(async ({ where }) => {
          const { id, ...rest } = where;
          const u = users.find((x) => x.id === id && matches(x, rest));
          return u ? { id: u.id } : null;
        }),
      },
      savedVendor: {
        upsert: jest.fn(async ({ create }) => ({ id: 'new', vendor_id: create.vendor_id, created_at: new Date() })),
        deleteMany: jest.fn(async () => ({ count: 1 })),
        findMany: jest.fn(async ({ where }) =>
          saved
            .filter((s) => s.user_id === where.user_id)
            .map((s) => ({ ...s, vendor: users.find((u) => u.id === s.vendor_id) }))
            .filter((s) => matches(s.vendor, where.vendor)),
        ),
      },
      review: {
        groupBy: jest.fn(async () => [{ vendor_id: 'live', _avg: { rating: 4.5 }, _count: { _all: 2 } }]),
      },
    };
    service = new SavedVendorsService(prisma);
  });

  describe('save', () => {
    it('saves a live vendor', async () => {
      const res = await service.save('me', 'live');
      expect(res.data.vendor_id).toBe('live');
      expect(prisma.savedVendor.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: { user_id: 'me', vendor_id: 'live' } }),
      );
    });

    it.each(['suspended', 'deleted', 'customer', 'nobody'])('refuses %s with a 404', async (id) => {
      await expect(service.save('me', id)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.savedVendor.upsert).not.toHaveBeenCalled();
    });

    it('refuses an id that is not a plain string', async () => {
      await expect(service.save('me', { not: 'x' } as any)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.save('me', '')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });
  });

  it('removes only the current user’s saved vendor', async () => {
    await expect(service.remove('me', 'live')).resolves.toEqual({ success: true });
    expect(prisma.savedVendor.deleteMany).toHaveBeenCalledWith({ where: { user_id: 'me', vendor_id: 'live' } });
  });

  describe('findAll', () => {
    it('lists only vendors still on the marketplace, with their rating', async () => {
      const res = await service.findAll('me');
      expect(res.data.map((s) => s.vendor.id)).toEqual(['live']);
      expect(res.data[0].vendor).toMatchObject({
        name: 'Vendor live',
        business_name: 'Shop live',
        handle: 'live',
        avatar_url: expect.stringContaining('live.png'),
        location: 'Atlanta, GA',
        categories: ['Catering'],
        listing_count: 2,
        avg_rating: 4.5,
        review_count: 2,
      });
    });

    it('never reads or returns contact details, the business address or position', async () => {
      const res = await service.findAll('me');
      const select = JSON.stringify(prisma.savedVendor.findMany.mock.calls[0][0].select);
      const body = JSON.stringify(res);
      for (const field of ['email', 'phone_number', 'business_address', 'business_lat', 'business_lng']) {
        expect(select).not.toContain(field);
        expect(body).not.toContain(field);
      }
      expect(body).not.toContain('1 Private St');
    });

    it('skips the rating lookup when nothing is saved', async () => {
      saved = [];
      await expect(service.findAll('me')).resolves.toEqual({ success: true, data: [] });
      expect(prisma.review.groupBy).not.toHaveBeenCalled();
    });
  });

  it('returns the ids of live saved vendors only', async () => {
    await expect(service.getSavedIds('me')).resolves.toEqual({ success: true, data: ['live'] });
  });
});
