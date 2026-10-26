import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BookingStatus } from 'prisma/generated/client';
import { BookingService } from './booking.service';
import { BookingTrackerService } from './booking-tracker.service';
import { contactRevealed, CONTACT_WINDOW_DAYS, serviceAtOf, stepCheck, stepsOpen, trackerDetails } from './booking-tracker';

const DAY = 24 * 3600 * 1000;
const now = new Date('2026-11-14T15:00:00Z');

describe('contactRevealed (phone numbers and the vendor address)', () => {
  it.each([
    [BookingStatus.PENDING, false],
    [BookingStatus.CONFIRMED, true],
    [BookingStatus.IN_PROGRESS, true],
    [BookingStatus.CANCELLED, false],
    [BookingStatus.REJECTED, false],
  ])('%s → %s', (status, shown) => {
    expect(contactRevealed({ status, completed_at: null }, now)).toBe(shown);
  });

  it(`keeps them for ${CONTACT_WINDOW_DAYS} days after the booking is done, then hides them`, () => {
    const done = (daysAgo: number) => ({ status: BookingStatus.COMPLETED, completed_at: new Date(now.getTime() - daysAgo * DAY) });
    expect(contactRevealed(done(0), now)).toBe(true);
    expect(contactRevealed(done(2.9), now)).toBe(true);
    expect(contactRevealed(done(3), now)).toBe(true);
    expect(contactRevealed(done(3.01), now)).toBe(false);
    expect(contactRevealed({ status: BookingStatus.COMPLETED, completed_at: null }, now)).toBe(false);
  });
});

describe('day-of steps', () => {
  const at = (iso: string) => new Date(iso);
  const base = { status: BookingStatus.CONFIRMED, listing: { service_at: 'CUSTOMER_LOCATION' }, event_start_at: at('2026-11-15T18:00:00Z') };

  it('treats rentals and older packages as at the customer’s place', () => {
    expect(serviceAtOf({ listing: null })).toBe('CUSTOMER_LOCATION');
    expect(serviceAtOf({ listing: { service_at: null } })).toBe('CUSTOMER_LOCATION');
    expect(serviceAtOf({ listing: { service_at: 'VENDOR_LOCATION' } })).toBe('VENDOR_LOCATION');
  });

  it('opens on the day before and the day itself, in the customer’s time zone', () => {
    const start = at('2026-11-15T02:00:00Z'); // 8pm on the 14th in Chicago
    expect(stepsOpen(start, at('2026-11-13T05:59:00Z'), 'America/Chicago')).toBe(false); // 11:59pm on the 12th
    expect(stepsOpen(start, at('2026-11-13T06:00:00Z'), 'America/Chicago')).toBe(true); // the 13th: the day before
    expect(stepsOpen(start, at('2026-11-13T06:00:00Z'), 'UTC')).toBe(false); // in UTC that is the 15th
    expect(stepsOpen(null, now)).toBe(false);
  });

  it('only moves forward and asking again changes nothing', () => {
    expect(stepCheck(base, 'en_route', now)).toBe('ok');
    expect(stepCheck({ ...base, en_route_at: now }, 'en_route', now)).toBe('done');
    expect(stepCheck({ ...base, en_route_at: now }, 'arrived', now)).toBe('ok');
    // arriving without "On my way" is fine; going back to "On my way" after arriving is not
    expect(stepCheck(base, 'arrived', now)).toBe('ok');
    expect(stepCheck({ ...base, arrived_at: now }, 'en_route', now)).toBe('done');
    expect(stepCheck({ ...base, arrived_at: now }, 'arrived', now)).toBe('done');
  });

  it.each([BookingStatus.PENDING, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED, BookingStatus.CANCELLED, BookingStatus.REJECTED])(
    'refuses a new step on a %s booking',
    (status) => {
      expect(stepCheck({ ...base, status }, 'en_route', now)).toEqual({ error: expect.stringContaining('accepted bookings') });
    },
  );

  it('matches the steps to where the service happens', () => {
    const atVendor = { ...base, listing: { service_at: 'VENDOR_LOCATION' } };
    expect(stepCheck(atVendor, 'check_in', now)).toBe('ok');
    expect(stepCheck(atVendor, 'en_route', now)).toEqual({ error: expect.stringContaining('Customer arrived') });
    expect(stepCheck(base, 'check_in', now)).toEqual({ error: expect.stringContaining('On my way') });
    expect(stepCheck({ ...base, rental_reservations: [{}] }, 'en_route', now)).toEqual({ error: expect.stringContaining('Rentals') });
  });

  it('waits until the day before', () => {
    expect(stepCheck({ ...base, event_start_at: at('2026-11-20T18:00:00Z') }, 'en_route', now)).toEqual({ error: expect.stringContaining('day before') });
  });
});

describe('trackerDetails', () => {
  const prismaWith = (phone: string | null, place: Record<string, unknown> | null = null) => ({
    user: { findUnique: jest.fn().mockResolvedValue({ phone_number: phone }) },
    vendorProfile: { findUnique: jest.fn().mockResolvedValue(place) },
    bookingContract: { findFirst: jest.fn().mockResolvedValue({ merge_data: { timezone: 'UTC' } }) },
  });
  const booking = (status: BookingStatus, service_at = 'CUSTOMER_LOCATION') => ({
    id: 'b1',
    status,
    completed_at: null,
    customer_id: 'cust',
    vendor_id: 'vend',
    listing: { service_at },
    event_start_at: new Date('2026-11-15T18:00:00Z'),
  });

  it('never loads a phone number or address while the booking is a request', async () => {
    const prisma = prismaWith('+1 555 0100', { business_address: '1 Shop St' });
    const out = await trackerDetails(prisma as any, booking(BookingStatus.PENDING, 'VENDOR_LOCATION'), 'cust', now);
    expect(out).toMatchObject({ contact_revealed: false, contact_phone: null, vendor_place: null, service_at: 'VENDOR_LOCATION' });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.vendorProfile.findUnique).not.toHaveBeenCalled();
  });

  it('gives each side the other’s number once accepted, and the customer the vendor’s address', async () => {
    const prisma = prismaWith('+1 555 0100', { business_address: '1 Shop St, Austin, TX', business_lat: 30.2, business_lng: -97.7 });
    const forCustomer = await trackerDetails(prisma as any, booking(BookingStatus.CONFIRMED, 'VENDOR_LOCATION'), 'cust', now);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'vend' }, select: { phone_number: true } });
    expect(forCustomer).toMatchObject({ contact_phone: '+1 555 0100', vendor_place: { address: '1 Shop St, Austin, TX', lat: 30.2, lng: -97.7 } });

    const forVendor = await trackerDetails(prisma as any, booking(BookingStatus.CONFIRMED, 'VENDOR_LOCATION'), 'vend', now);
    expect(prisma.user.findUnique).toHaveBeenLastCalledWith({ where: { id: 'cust' }, select: { phone_number: true } });
    expect(forVendor).toMatchObject({ contact_phone: '+1 555 0100', vendor_place: null, steps_open: true });
  });

  it('has no number when the other side has none, and no address for packages at the customer’s place', async () => {
    const prisma = prismaWith(null, { business_address: '1 Shop St' });
    const out = await trackerDetails(prisma as any, booking(BookingStatus.IN_PROGRESS), 'cust', now);
    expect(out).toMatchObject({ contact_revealed: true, contact_phone: null, vendor_place: null });
    expect(prisma.vendorProfile.findUnique).not.toHaveBeenCalled();
  });
});

describe('BookingTrackerService.step', () => {
  const stored = (over: Record<string, unknown> = {}) => ({
    id: 'b1',
    vendor_id: 'vend',
    customer_id: 'cust',
    status: BookingStatus.CONFIRMED,
    event_start_at: new Date(now.getTime() + 3 * 3600 * 1000),
    scheduled_at: null,
    en_route_at: null,
    arrived_at: null,
    checked_in_at: null,
    listing: { title: 'Wedding DJ', service_at: 'CUSTOMER_LOCATION' },
    rental_reservations: [],
    vendor: { name: 'DJ Sam' },
    ...over,
  });
  const setup = (row: Record<string, unknown>, moved = 1) => {
    const prisma: any = {
      booking: {
        findFirst: jest.fn().mockResolvedValue(row),
        updateMany: jest.fn().mockResolvedValue({ count: moved }),
        findUnique: jest.fn().mockResolvedValue({ en_route_at: null }),
      },
      bookingContract: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    const bookings = { getBooking: jest.fn().mockResolvedValue({ success: true, data: { id: 'b1' } }) };
    return { prisma, push, bookings, svc: new BookingTrackerService(prisma, push as any, bookings as unknown as BookingService) };
  };

  it('records On my way and tells the customer (booking-updates push and inbox), never touching status', async () => {
    const { prisma, push, bookings, svc } = setup(stored());
    await svc.step('b1', 'vend', 'en_route', now);
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: 'b1', status: BookingStatus.CONFIRMED, en_route_at: null }, data: { en_route_at: now } });
    expect(push.sendToUser).toHaveBeenCalledWith('cust', { title: 'On the way', body: 'DJ Sam is on the way for Wedding DJ', data: { type: 'booking', bookingId: 'b1' } }, 'booking_updates');
    expect(bookings.getBooking).toHaveBeenCalledWith('b1', 'vend');
  });

  it('tells the customer when the vendor arrives, but not when the customer checks in', async () => {
    const a = setup(stored({ en_route_at: now }));
    await a.svc.step('b1', 'vend', 'arrived', now);
    expect(a.push.sendToUser).toHaveBeenCalledWith('cust', expect.objectContaining({ title: 'Your vendor has arrived' }), 'booking_updates');

    const c = setup(stored({ listing: { title: 'Haircut', service_at: 'VENDOR_LOCATION' } }));
    await c.svc.step('b1', 'vend', 'check_in', now);
    expect(c.prisma.booking.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { checked_in_at: now } }));
    expect(c.push.sendToUser).not.toHaveBeenCalled();
  });

  it('only the booking’s vendor can take a step', async () => {
    const { prisma, svc } = setup(stored());
    await expect(svc.step('b1', 'cust', 'en_route', now)).rejects.toThrow(ForbiddenException);
    await expect(svc.step('b1', 'someone-else', 'en_route', now)).rejects.toThrow(ForbiddenException);
    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it('is idempotent: a step already taken is not recorded or pushed again', async () => {
    const { prisma, push, bookings, svc } = setup(stored({ en_route_at: new Date(now.getTime() - 60_000) }));
    await svc.step('b1', 'vend', 'en_route', now);
    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
    expect(push.sendToUser).not.toHaveBeenCalled();
    expect(bookings.getBooking).toHaveBeenCalled();
  });

  it('refuses other statuses and a booking that changed while saving', async () => {
    const cancelled = setup(stored({ status: BookingStatus.CANCELLED }));
    await expect(cancelled.svc.step('b1', 'vend', 'en_route', now)).rejects.toThrow(BadRequestException);
    expect(cancelled.prisma.booking.updateMany).not.toHaveBeenCalled();

    const raced = setup(stored(), 0);
    await expect(raced.svc.step('b1', 'vend', 'en_route', now)).rejects.toThrow('changed in the meantime');
    expect(raced.push.sendToUser).not.toHaveBeenCalled();
  });
});

describe('geocoding a booking request', () => {
  it('puts the venue on the map in the background, without waiting for it', async () => {
    let finish!: () => void;
    const geocoder = { booking: jest.fn(() => new Promise<void>((r) => (finish = r))) };
    const prisma: any = {
      booking: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'b1',
          vendor_id: 'vend',
          customer_id: 'cust',
          venue_address: '12 Main St, Austin, TX',
          amount: 100,
          scheduled_at: null,
          customer: { id: 'cust', name: 'Ana', email: 'a@x.com', avatar: null },
          vendor: { id: 'vend', name: 'Sam', email: 's@x.com', avatar: null },
          listing: { id: 'l1', title: 'DJ', price: 100, images: [] },
        }),
      },
    };
    const contracts = { createSignedBooking: jest.fn().mockResolvedValue({ id: 'b1' }) };
    const mail = { sendBookingNotification: jest.fn().mockResolvedValue(undefined) };
    const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    const svc = new BookingService(prisma, mail as any, push as any, contracts as any, {} as any, {} as any, {} as any, {} as any, geocoder as any);
    const res = await svc.create('cust', { listing_id: 'l1' } as any);
    expect(res.success).toBe(true);
    expect(geocoder.booking).toHaveBeenCalledWith('b1');
    finish();
  });

  it('skips it when there is no venue', async () => {
    const geocoder = { booking: jest.fn() };
    const prisma: any = {
      booking: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'b2', vendor_id: 'vend', customer_id: 'cust', venue_address: null, amount: 100,
          customer: { name: 'Ana' }, vendor: { name: 'Sam', email: 's@x.com' }, listing: { title: 'DJ', images: [] },
        }),
      },
    };
    const svc = new BookingService(prisma, { sendBookingNotification: jest.fn().mockResolvedValue(undefined) } as any, { sendToUser: jest.fn() } as any, { createSignedBooking: jest.fn().mockResolvedValue({ id: 'b2' }) } as any, {} as any, {} as any, {} as any, {} as any, geocoder as any);
    await svc.create('cust', { listing_id: 'l1' } as any);
    expect(geocoder.booking).not.toHaveBeenCalled();
  });
});
