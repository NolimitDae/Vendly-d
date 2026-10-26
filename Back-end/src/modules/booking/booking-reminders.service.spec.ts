import { BookingStatus } from 'prisma/generated/client';
import { BookingRemindersService, CHANGES_EXPIRED_REASON, CLIENT_EXPIRED_REASON, EXPIRED_REASON } from './booking-reminders.service';
import { clientSignExpiresAt, requestExpiresAt } from './booking-requests';

jest.mock('src/config/app.config', () => ({ __esModule: true, default: () => ({ app: { client_app_url: 'https://vendly.test' } }) }));

const HOUR = 3_600_000;
const now = new Date('2026-10-24T12:00:00Z');
const ago = (h: number) => new Date(now.getTime() - h * HOUR);
const people = { customer: { name: 'Ada', email: 'ada@x.test' }, vendor: { name: 'Bloom Florals', email: 'bloom@x.test' } };
const booking = (over: any = {}) => ({ id: 'b1', customer_id: 'c1', vendor_id: 'v1', status: BookingStatus.PENDING, created_at: ago(1), event_start_at: null, listing: { title: 'Wedding flowers' }, ...people, ...over });

function setup() {
  const prisma: any = {
    booking: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const mail = { sendBookingNotification: jest.fn().mockResolvedValue(undefined) };
  const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  const contracts = { voidPendingForBooking: jest.fn().mockResolvedValue(undefined) };
  return { service: new BookingRemindersService(prisma, mail as any, push as any, contracts as any), prisma, mail, push, contracts };
}

describe('requestExpiresAt', () => {
  it('is 72 hours after the request, or when the event starts if sooner', () => {
    expect(requestExpiresAt({ created_at: ago(0) })).toEqual(new Date(now.getTime() + 72 * HOUR));
    const start = new Date(now.getTime() + 10 * HOUR);
    expect(requestExpiresAt({ created_at: ago(0), event_start_at: start })).toEqual(start);
  });
});

describe('requestExpiresAt edge cases', () => {
  it('a date-only start (rental pickup day) counts to the end of that day', () => {
    const pickup = new Date('2026-10-24T00:00:00Z');
    expect(requestExpiresAt({ created_at: new Date('2026-10-24T10:00:00Z'), event_start_at: pickup })).toEqual(new Date('2026-10-25T00:00:00Z'));
  });

  it('stays open at least two hours however close the event is', () => {
    const created = new Date('2026-10-24T10:00:00Z');
    expect(requestExpiresAt({ created_at: created, event_start_at: new Date('2026-10-24T10:30:00Z') })).toEqual(new Date('2026-10-24T12:00:00Z'));
  });

  it("starts the clock when a planner's client co-signs", () => {
    const opened = new Date('2026-10-26T09:00:00Z');
    expect(requestExpiresAt({ created_at: new Date('2026-10-22T09:00:00Z'), request_opened_at: opened })).toEqual(new Date('2026-10-29T09:00:00Z'));
  });
});

describe('clientSignExpiresAt', () => {
  it('is the event start (a date-only start counts to the end of that day), or 14 days after the request', () => {
    const start = new Date('2026-11-14T15:00:00Z');
    expect(clientSignExpiresAt({ created_at: ago(500), event_start_at: start })).toEqual(start);
    expect(clientSignExpiresAt({ created_at: ago(1), event_start_at: new Date('2026-11-14T00:00:00Z') })).toEqual(new Date('2026-11-15T00:00:00Z'));
    expect(clientSignExpiresAt({ created_at: now })).toEqual(new Date(now.getTime() + 14 * 24 * HOUR));
  });
});

describe('BookingRemindersService', () => {
  it("never reminds requests still waiting for a planner's client, or closes them for the vendor's silence", async () => {
    const { service, prisma } = setup();
    await service.remindVendors(now);
    await service.expireRequests(now);
    const calls = prisma.booking.findMany.mock.calls.map(([args]: any) => args.where);
    // two reminder queries, the vendor-expiry query, the client-expiry query, then suggested changes nobody answered
    expect(calls).toHaveLength(5);
    for (const where of calls.slice(0, 3)) expect(where).toMatchObject({ status: BookingStatus.PENDING, contracts: { none: { status: 'AWAITING_CLIENT' } } });
    // nor ones whose suggested changes are with the customer (the clock is paused)
    for (const where of calls.slice(0, 3)) expect(where.AND).toEqual([{ contracts: { none: { status: 'AWAITING_CUSTOMER' } } }]);
    expect(calls[3]).toMatchObject({ status: BookingStatus.PENDING, contracts: { some: { status: 'AWAITING_CLIENT' } } });
    expect(calls[4]).toMatchObject({ status: BookingStatus.PENDING, contracts: { some: { status: 'AWAITING_CUSTOMER' } } });
  });

  it('works through a backlog bigger than one batch', async () => {
    const { service, prisma } = setup();
    const due = Array.from({ length: 200 }, (_, i) => booking({ id: `b${i}`, created_at: ago(100) }));
    prisma.booking.findMany.mockResolvedValueOnce(due).mockResolvedValueOnce([booking({ id: 'last', created_at: ago(100) })]);
    expect(await service.expireRequests(now)).toBe(201);
    // two vendor batches, then the (empty) client and suggested-changes queues
    expect(prisma.booking.findMany).toHaveBeenCalledTimes(4);
  });

  it("closes a planner's request at the event start when the client never co-signed, and tells the planner and vendor", async () => {
    const { service, prisma, push, mail, contracts } = setup();
    // nothing for the vendor queue; the client queue has one whose event started an hour ago
    prisma.booking.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([booking({ created_at: ago(400), event_start_at: ago(1) }), booking({ id: 'b2', created_at: ago(400), event_start_at: ago(-5) })]);
    expect(await service.expireRequests(now)).toBe(1);
    const where = prisma.booking.findMany.mock.calls[1][0].where;
    expect(where.OR).toEqual([{ event_start_at: { lte: now } }, { event_start_at: null, created_at: { lte: new Date(now.getTime() - 14 * 24 * HOUR) } }]);
    expect(prisma.booking.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', status: BookingStatus.PENDING },
      data: { status: BookingStatus.REJECTED, reject_reason: CLIENT_EXPIRED_REASON, expired_at: now },
    });
    expect(contracts.voidPendingForBooking).toHaveBeenCalledWith('b1', expect.stringContaining('co-sign'), null);
    expect(push.sendToUser).toHaveBeenCalledWith('c1', expect.objectContaining({ body: expect.stringContaining('client didn’t co-sign') }), 'booking_updates');
    expect(push.sendToUser).toHaveBeenCalledWith('v1', expect.objectContaining({ body: expect.stringContaining('client didn’t co-sign') }), 'booking_updates');
    expect(mail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ to: 'ada@x.test', ctaUrl: 'https://vendly.test/bookings/b1' }));
  });

  it('closes a request at the event start when the customer never answered the suggested changes', async () => {
    const { service, prisma, push, contracts } = setup();
    // nothing for the vendor or client queues; suggested changes waiting on an event that started an hour ago
    prisma.booking.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([booking({ created_at: ago(400), event_start_at: ago(1) }), booking({ id: 'b2', created_at: ago(400), event_start_at: ago(-5) })]);
    expect(await service.expireRequests(now)).toBe(1);
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', status: BookingStatus.PENDING },
      data: { status: BookingStatus.REJECTED, reject_reason: CHANGES_EXPIRED_REASON, expired_at: now },
    });
    expect(contracts.voidPendingForBooking).toHaveBeenCalledWith('b1', expect.stringContaining('suggested changes'), null);
    expect(push.sendToUser).toHaveBeenCalledWith('c1', expect.objectContaining({ body: expect.stringContaining('weren’t answered before the event') }), 'booking_updates');
    expect(push.sendToUser).toHaveBeenCalledWith('v1', expect.objectContaining({ body: expect.stringContaining('didn’t answer your suggested changes') }), 'booking_updates');
  });

  it("closes a planner's undated request 14 days after it was made", async () => {
    const { service, prisma } = setup();
    prisma.booking.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([booking({ created_at: ago(14 * 24 + 1) }), booking({ id: 'b2', created_at: ago(13 * 24) })]);
    expect(await service.expireRequests(now)).toBe(1);
    expect(prisma.booking.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'b1', status: BookingStatus.PENDING } }));
  });

  it('closes requests nobody answered, voids the contract and tells both sides', async () => {
    const { service, prisma, push, mail, contracts } = setup();
    prisma.booking.findMany.mockResolvedValueOnce([booking({ created_at: ago(73) })]);
    expect(await service.expireRequests(now)).toBe(1);
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', status: BookingStatus.PENDING },
      data: { status: BookingStatus.REJECTED, reject_reason: EXPIRED_REASON, expired_at: now },
    });
    expect(contracts.voidPendingForBooking).toHaveBeenCalledWith('b1', expect.stringContaining('expired'), null);
    expect(push.sendToUser).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'Request closed', body: expect.stringContaining('haven’t been charged') }), 'booking_updates');
    expect(push.sendToUser).toHaveBeenCalledWith('v1', expect.objectContaining({ title: 'Request closed' }), 'booking_updates');
    expect(mail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ to: 'ada@x.test', status: 'REJECTED' }));
  });

  it('closes a request whose event has started even if it is recent', async () => {
    const { service, prisma } = setup();
    prisma.booking.findMany.mockResolvedValueOnce([booking({ created_at: ago(5), event_start_at: ago(1) })]);
    expect(await service.expireRequests(now)).toBe(1);
  });

  it('leaves a request alone if the vendor answered in the meantime', async () => {
    const { service, prisma, push, contracts } = setup();
    prisma.booking.findMany.mockResolvedValueOnce([booking({ created_at: ago(80) })]);
    prisma.booking.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await service.expireRequests(now)).toBe(0);
    expect(contracts.voidPendingForBooking).not.toHaveBeenCalled();
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('skips requests that are not due yet', async () => {
    const { service, prisma } = setup();
    prisma.booking.findMany.mockResolvedValueOnce([booking({ created_at: ago(10) })]);
    expect(await service.expireRequests(now)).toBe(0);
    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it('reminds the vendor once, a day before a request closes', async () => {
    const { service, prisma, push, mail } = setup();
    prisma.booking.findMany.mockResolvedValueOnce([booking({ created_at: ago(50) })]).mockResolvedValueOnce([]);
    expect(await service.remindVendors(now)).toBe(1);
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: 'b1', expiry_reminded_at: null, status: BookingStatus.PENDING }, data: { expiry_reminded_at: now } });
    expect(push.sendToUser).toHaveBeenCalledWith('v1', expect.objectContaining({ body: expect.stringContaining('closes in 22 hours') }), 'reminders');
    expect(mail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ to: 'bloom@x.test', ctaUrl: 'https://vendly.test/vendor/bookings/b1' }));
  });

  it('asks the customer how it went, once', async () => {
    const { service, prisma, push, mail } = setup();
    prisma.booking.findMany.mockResolvedValueOnce([booking({ status: BookingStatus.COMPLETED, completed_at: ago(50) })]);
    expect(await service.askForReviews(now)).toBe(1);
    const where = prisma.booking.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: BookingStatus.COMPLETED, review: null, review_reminded_at: null, review_prompt_dismissed_at: null, dispute_opened_at: null });
    expect(push.sendToUser).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'How was Bloom Florals?', data: { type: 'booking', bookingId: 'b1' } }), 'review_requests');
    expect(mail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ ctaUrl: 'https://vendly.test/bookings/b1' }));
  });

  it('one failing job does not stop the others', async () => {
    const { service, prisma } = setup();
    prisma.booking.findMany.mockRejectedValueOnce(new Error('db blip'));
    await expect(service.hourly()).resolves.toBeUndefined();
    expect(prisma.booking.findMany).toHaveBeenCalledTimes(5); // the next jobs still ran (expire for vendors, clients and suggested changes, reviews)
  });
});
