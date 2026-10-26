import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TestDataService } from './test-data.service';
import { CATALOG } from './test-data-catalog';
import { categorySlug, guessTimeZone, spreadAround, testEmail, testHandle } from './test-data-helpers';
import { sniffUpload } from 'src/common/helper/upload-files';

jest.mock('src/common/helper/job-lock', () => ({ withJobLock: (_p: unknown, _k: string, job: () => Promise<unknown>) => job() }));
jest.mock('src/modules/geo/geo', () => ({ geocode: jest.fn() }));
import { geocode } from 'src/modules/geo/geo';

// placeholder photos and password hashes take a moment
jest.setTimeout(30_000);

const CATEGORIES = [
  { id: 'c-cat', name: 'Catering & Food', sub_categories: [{ id: 's-full', name: 'Full-service catering' }] },
  { id: 'c-rent', name: 'Rentals & Equipment', sub_categories: [] },
  { id: 'c-new', name: 'Balloon Artists', sub_categories: [] },
];

/** A small in-memory stand-in for the tables the service reads, filled by the mocked services. */
function setup() {
  const db = {
    users: [] as any[],
    listings: [] as any[],
    addOns: [] as any[],
    contracts: [] as any[],
    rentals: [] as any[],
    bookings: [] as any[],
    flags: [] as any[],
  };
  let seq = 0;
  const prisma: any = {
    serviceCategory: { findMany: jest.fn(async () => CATEGORIES) },
    featureFlag: { findUnique: jest.fn(async ({ where }: any) => db.flags.find((f) => f.key === where.key) ?? null) },
    vendorProfile: { findUnique: jest.fn(async () => null) },
    user: {
      findMany: jest.fn(async ({ where }: any) =>
        db.users
          .filter((u) => !u.deleted_at && (where.email?.in ? where.email.in.includes(u.email) : true) && (where.is_test === undefined || u.is_test === where.is_test))
          .map((u) => ({ ...u, vendorProfile: u.vendorProfile, _count: { vendorListings: db.listings.filter((l) => l.vendor_id === u.id && !l.deleted_at).length } })),
      ),
      create: jest.fn(async ({ data }: any) => {
        const u = { id: `u${++seq}`, ...data, vendorProfile: data.vendorProfile.create };
        db.users.push(u);
        return { id: u.id };
      }),
      findUnique: jest.fn(async ({ where }: any) => db.users.find((u) => u.id === where.id) ?? null),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = where.id
          ? db.users.filter((u) => u.id === where.id && Number(u.balance ?? 0) === Number(where.balance))
          : db.users.filter((u) => u.is_test === where.is_test && !u.deleted_at);
        hit.forEach((u) => Object.assign(u, data));
        return { count: hit.length };
      }),
    },
    vendorContract: { count: jest.fn(async ({ where }: any) => db.contracts.filter((c) => c.vendor_id === where.vendor_id).length) },
    vendorListing: { findMany: jest.fn(async ({ where }: any) => db.listings.filter((l) => l.vendor_id === where.vendor_id && !l.deleted_at)) },
    vendorAddOn: { findMany: jest.fn(async ({ where }: any) => db.addOns.filter((a) => a.vendor_id === where.vendor_id)) },
    rentalItem: { findMany: jest.fn(async ({ where }: any) => db.rentals.filter((r) => r.vendor_id === where.vendor_id && !r.deleted_at)) },
    paymentTransaction: { create: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
    booking: { findMany: jest.fn(async ({ where }: any) => db.bookings.filter((b) => (b.vendor_id === where.OR[0].vendor_id || b.customer_id === where.OR[1].customer_id) && where.status.in.includes(b.status))) },
  };
  const listings = {
    create: jest.fn(async (vendorId: string, dto: any, files: any[]) => {
      const l = { id: `l${++seq}`, vendor_id: vendorId, ...dto, files };
      db.listings.push(l);
      return { success: true, data: l };
    }),
    remove: jest.fn(async (id: string) => {
      db.listings.find((l) => l.id === id).deleted_at = new Date();
      return { success: true };
    }),
  };
  const contracts = { createDefault: jest.fn(async (vendorId: string, dto: any) => db.contracts.push({ vendor_id: vendorId, ...dto })) };
  const addOns = {
    create: jest.fn(async (vendorId: string, dto: any) => db.addOns.push({ id: `a${++seq}`, vendor_id: vendorId, ...dto })),
    bulkAttach: jest.fn(async () => ({ success: true })),
  };
  const rentals = {
    createItem: jest.fn(async (vendorId: string, dto: any) => db.rentals.push({ id: `r${++seq}`, vendor_id: vendorId, ...dto })),
    removeItem: jest.fn(async (id: string) => (db.rentals.find((r) => r.id === id).deleted_at = new Date())),
  };
  const bookings = { cancel: jest.fn(async () => ({ success: true, data: { refund_summary: { refund_total: 120 } } })) };
  const auth = {
    deleteAccount: jest.fn(async (id: string) => {
      const u = db.users.find((x) => x.id === id);
      u.deleted_at = new Date();
      u.email = `deleted-${id}@deleted.invalid`;
      return { success: true, message: 'Account deleted.' };
    }),
  };
  const service = new TestDataService(prisma, listings as any, contracts as any, addOns as any, rentals as any, bookings as any, auth as any);
  return { service, db, prisma, listings, contracts, addOns, rentals, bookings, auth };
}

describe('TestDataService', () => {
  beforeEach(() => {
    (geocode as jest.Mock).mockReset().mockResolvedValue({ lat: 33.749, lng: -84.388 });
  });

  it('creates verified, approved vendors for every category with one shared password, packages, a contract and add-ons', async () => {
    const { service, db, listings, contracts, addOns, rentals } = setup();
    const res = await service.create({ near: 'Atlanta, GA' });

    // 2 catering vendors, 1 rentals vendor, 1 plain vendor for the category added later
    expect(db.users.map((u) => u.email)).toEqual([
      'test-catering-food-1@vendly.test',
      'test-catering-food-2@vendly.test',
      'test-rentals-equipment-1@vendly.test',
      'test-balloon-artists-1@vendly.test',
    ]);
    const u = db.users[0];
    expect(u).toMatchObject({ type: 'VENDOR', roles: ['VENDOR'], is_test: true, location: 'Atlanta, GA' });
    expect(u.email_verified_at).toBeInstanceOf(Date);
    expect(u.onboarding_seen.VENDOR.complete).toBeTruthy();
    expect(u.vendorProfile).toMatchObject({ business_name: 'Golden Fork Catering Co (Test)', license_status: 'APPROVED', handle: 'test-catering-food-1' });
    expect(u.vendorProfile.working_hours.timezone).toBe('America/New_York');

    // one password for all, stored only as a hash
    const password = res.data.password!;
    expect(password).toMatch(/^[\w]{4}-[\w]{4}-[\w]{4}-[\w]{4}$/);
    expect(new Set(db.users.map((x) => x.password)).size).toBe(1);
    expect(await bcrypt.compare(password, u.password)).toBe(true);

    // packages: live, near the place, with a real photo through the normal upload path
    const first = listings.create.mock.calls[0];
    expect(first[1]).toMatchObject({ title: 'Southern Buffet Dinner', status: 'ACTIVE', price_unit: 'person', category_id: 'c-cat', sub_category_id: 's-full', location: 'Atlanta, GA', payment_plan: 'DEPOSIT_50', min_quantity: 25 });
    expect(Math.abs(first[1].lat - 33.749)).toBeLessThan(0.2);
    expect(sniffUpload(first[2][0].buffer, ['image'])).toBe('png');
    expect(db.listings).toHaveLength(2 + 2 + 2 + 1);
    expect(contracts.createDefault).toHaveBeenCalledTimes(4);
    expect(contracts.createDefault.mock.calls[0][1]).toMatchObject({ category: 'CATERING', applies_to_all: true, field_values: expect.objectContaining({ cancellation_policy: 'moderate', menu: expect.any(String) }) });
    expect(addOns.create.mock.calls[0][1]).toMatchObject({ name: 'Additional server', in_library: true, listing_ids: [db.listings[0].id, db.listings[1].id] });
    // rentals are on unless switched off: the rentals vendor gets its items
    expect(rentals.createItem).toHaveBeenCalledTimes(CATALOG['Rentals & Equipment'].vendors[0].rentals!.length);
    expect(res.data.created).toMatchObject({ vendors_created: 4, packages_created: 7, contracts_created: 4 });
    expect(res.data.accounts).toHaveLength(4);
  });

  it('only fills gaps when run again, and keeps the password', async () => {
    const { service, db, listings, contracts, addOns, rentals, prisma } = setup();
    await service.create({ near: 'Atlanta, GA' });
    const hash = db.users[0].password;
    listings.create.mockClear();
    contracts.createDefault.mockClear();
    addOns.create.mockClear();
    rentals.createItem.mockClear();
    prisma.user.updateMany.mockClear();

    // someone archived one package meanwhile
    db.listings[0].deleted_at = new Date();
    const again = await service.create({ near: 'Atlanta, GA' });
    expect(prisma.user.create).toHaveBeenCalledTimes(4);
    expect(listings.create).toHaveBeenCalledTimes(1);
    expect(listings.create.mock.calls[0][1].title).toBe('Southern Buffet Dinner');
    expect(contracts.createDefault).not.toHaveBeenCalled();
    expect(addOns.create).not.toHaveBeenCalled();
    expect(rentals.createItem).not.toHaveBeenCalled();
    expect(again.data.password).toBeNull();
    expect(again.data.password_note).toMatch(/hasn’t changed/);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(db.users[0].password).toBe(hash);
  });

  it('gives every test vendor a new password when one is reset or a new account is made', async () => {
    const { service, db } = setup();
    await service.create({ near: 'Atlanta, GA' });
    const reset = await service.create({ near: 'Atlanta, GA', reset_password: true });
    expect(reset.data.password).toBeTruthy();
    expect(reset.data.password_note).toMatch(/new password/);
    for (const u of db.users) expect(await bcrypt.compare(reset.data.password!, u.password)).toBe(true);
  });

  it('never takes over a real account with the same address, and skips rentals when switched off', async () => {
    const { service, db, rentals } = setup();
    db.flags.push({ key: 'rentals', enabled: false });
    db.users.push({ id: 'real', email: 'test-catering-food-1@vendly.test', is_test: false });
    const res = await service.create({ near: 'Atlanta, GA' });
    expect(res.data.skipped).toEqual([{ email: 'test-catering-food-1@vendly.test', reason: expect.stringMatching(/real account/) }]);
    expect(db.listings.some((l) => l.vendor_id === 'real')).toBe(false);
    expect(rentals.createItem).not.toHaveBeenCalled();
  });

  it('uses a picked position as is, and says when a typed place isn’t found', async () => {
    const { service } = setup();
    await service.create({ near: 'Austin, TX', lat: 30.27, lng: -97.74 });
    expect(geocode).not.toHaveBeenCalled();

    (geocode as jest.Mock).mockResolvedValue(null);
    await expect(service.create({ near: 'Nowhere at all' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('without a place, uses where the test vendors already are, or asks for one', async () => {
    const { service, prisma } = setup();
    prisma.vendorListing.findFirst = jest.fn().mockResolvedValueOnce(null);
    await expect(service.create({ reset_password: true })).rejects.toThrow(/Enter where/);

    prisma.vendorListing.findFirst.mockResolvedValueOnce({ location: 'Denver, CO', lat: 39.74, lng: -104.99 });
    const res = await service.create({ reset_password: true });
    expect(res.data).toMatchObject({ near: 'Denver, CO', timezone: 'America/Denver' });
    expect(geocode).not.toHaveBeenCalled();
  });

  it('removal cancels open bookings as the vendor, removes packages and deletes the accounts', async () => {
    const { service, db, bookings, listings, rentals, auth } = setup();
    await service.create({ near: 'Atlanta, GA' });
    const vendor = db.users[0];
    db.bookings.push(
      { id: 'b-open', vendor_id: vendor.id, customer_id: 'cust', status: 'CONFIRMED', listing: { title: 'Southern Buffet Dinner' } },
      { id: 'b-disputed', vendor_id: vendor.id, customer_id: 'cust', status: 'IN_PROGRESS', dispute_opened_at: new Date(), dispute_resolved_at: null, listing: { title: 'Plated Three-Course Dinner' } },
      { id: 'b-done', vendor_id: vendor.id, customer_id: 'cust', status: 'COMPLETED' },
    );
    // a disputed booking keeps the account
    auth.deleteAccount.mockImplementationOnce(async () => ({ success: false, message: 'You can’t delete your account yet. 1 booking has an open dispute.' }));

    const res = await service.remove();
    expect(bookings.cancel).toHaveBeenCalledTimes(1);
    expect(bookings.cancel).toHaveBeenCalledWith('b-open', vendor.id, { reason_code: 'other', note: 'Test data removed' });
    expect(res.data.cancelled).toEqual([{ booking_id: 'b-open', package: 'Southern Buffet Dinner', status: 'CONFIRMED', refunded: 120 }]);
    expect(res.data.not_cancelled).toEqual([{ booking_id: 'b-disputed', package: 'Plated Three-Course Dinner', reason: expect.stringMatching(/open dispute/) }]);
    // every package and rental item is gone from search, even for the kept account
    expect(listings.remove).toHaveBeenCalledTimes(7);
    expect(db.listings.every((l) => l.deleted_at)).toBe(true);
    expect(rentals.removeItem).toHaveBeenCalledTimes(3);
    expect(auth.deleteAccount).toHaveBeenCalledTimes(4);
    expect(res.data.kept).toEqual([{ email: 'test-catering-food-1@vendly.test', reason: expect.stringMatching(/open dispute/) }]);
    expect(res.data.removed).toHaveLength(3);
  });

  it('removal wipes a leftover balance (in or owed), with a record, before deleting the account', async () => {
    const { service, db, prisma } = setup();
    await service.create({ near: 'Atlanta, GA' });
    db.users[0].balance = 85.25;
    db.users[1].balance = -12;
    const [first, second] = [db.users[0].email, db.users[1].email];

    const res = await service.remove();
    expect(res.data.wiped).toEqual([
      { email: first, amount: 85.25 },
      { email: second, amount: -12 },
    ]);
    expect(db.users[0].balance).toBe(0);
    expect(db.users[1].balance).toBe(0);
    expect(prisma.paymentTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ user_id: db.users[0].id, type: 'test_balance_wiped', amount: 85.25 }) });
    expect(res.data.counts.wiped).toBe(2);
  });
});

describe('test data helpers', () => {
  it('names accounts and shop handles after the category', () => {
    expect(categorySlug('Photography & Video')).toBe('photography-video');
    expect(testEmail('Music & Entertainment', 2)).toBe('test-music-entertainment-2@vendly.test');
    expect(testHandle('Officiants & Ceremony', 1)).toBe('test-officiants-ceremony-1');
    // long names are shortened to the 30-character handle limit
    expect(testHandle('Extremely Long Category Name For Testing', 1)!.length).toBeLessThanOrEqual(30);
  });

  it('guesses the vendor time zone from the state, else the longitude', () => {
    expect(guessTimeZone('Atlanta, GA', { lat: 33.7, lng: -84.4 })).toBe('America/New_York');
    expect(guessTimeZone('Denver, CO', { lat: 39.7, lng: -105 })).toBe('America/Denver');
    expect(guessTimeZone('Somewhere', { lat: 41.9, lng: -87.6 })).toBe('America/Chicago');
    expect(guessTimeZone('London', { lat: 51.5, lng: -0.1 })).toBe('UTC');
    expect(guessTimeZone('Lagos', { lat: 6.5, lng: 3.4 })).toBe('UTC');
    expect(guessTimeZone('Berlin', { lat: 52.5, lng: 13.4 })).toBe('Etc/GMT-1');
  });

  it('spreads vendors a few miles around the place', () => {
    const a = spreadAround({ lat: 33.749, lng: -84.388 }, 0);
    const b = spreadAround({ lat: 33.749, lng: -84.388 }, 1);
    expect(a).not.toEqual(b);
    for (const p of [a, b]) {
      expect(Math.abs(p.lat - 33.749)).toBeLessThan(0.1);
      expect(Math.abs(p.lng + 84.388)).toBeLessThan(0.1);
    }
  });

  it('has a sensible entry for every seeded category', () => {
    for (const [name, cat] of Object.entries(CATALOG)) {
      expect(cat.vendors.length).toBeGreaterThan(0);
      for (const v of cat.vendors) {
        expect(v.packages.length).toBeGreaterThanOrEqual(1);
        expect(v.packages.length).toBeLessThanOrEqual(2);
        for (const p of v.packages) expect(p.price).toBeGreaterThan(0);
      }
      expect(testHandle(name, 2)).toBeTruthy();
    }
    // the categories most events need get two vendors
    for (const name of ['Photography & Video', 'Catering & Food', 'Music & Entertainment', 'Venues', 'Decor & Florals']) expect(CATALOG[name].vendors).toHaveLength(2);
  });
});
