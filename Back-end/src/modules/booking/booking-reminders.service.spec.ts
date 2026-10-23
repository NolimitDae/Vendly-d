import { BookingStatus } from 'prisma/generated/client';
import { BookingRemindersService, EXPIRED_REASON } from './booking-reminders.service';
import { requestExpiresAt } from './booking-requests';

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

describe('BookingRemindersService', () => {
  it("never reminds or closes requests still waiting for a planner's client", async () => {
    const { service, prisma } = setup();
    await service.remindVendors(now);
    await service.expireRequests(now);
    for (const [args] of prisma.booking.findMany.mock.calls) {
      expect(args.where).toMatchObject({ status: BookingStatus.PENDING, contracts: { none: { status: 'AWAITING_CLIENT' } } });
    }
  });

  it('works through a backlog bigger than one batch', async () => {
    const { service, prisma } = setup();
    const due = Array.from({ length: 200 }, (_, i) => booking({ id: `b${i}`, created_at: ago(100) }));
    prisma.booking.findMany.mockResolvedValueOnce(due).mockResolvedValueOnce([booking({ id: 'last', created_at: ago(100) })]);
    expect(await service.expireRequests(now)).toBe(201);
    expect(prisma.booking.findMany).toHaveBeenCalledTimes(2);
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
    expect(push.sendToUser).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'Request closed', body: expect.stringContaining('haven’t been charged') }));
    expect(push.sendToUser).toHaveBeenCalledWith('v1', expect.objectContaining({ title: 'Request closed' }));
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
    expect(push.sendToUser).toHaveBeenCalledWith('v1', expect.objectContaining({ body: expect.stringContaining('closes in 22 hours') }));
    expect(mail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ to: 'bloom@x.test', ctaUrl: 'https://vendly.test/vendor/bookings/b1' }));
  });

  it('asks the customer how it went, once', async () => {
    const { service, prisma, push, mail } = setup();
    prisma.booking.findMany.mockResolvedValueOnce([booking({ status: BookingStatus.COMPLETED, completed_at: ago(50) })]);
    expect(await service.askForReviews(now)).toBe(1);
    const where = prisma.booking.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: BookingStatus.COMPLETED, review: null, review_reminded_at: null, review_prompt_dismissed_at: null, dispute_opened_at: null });
    expect(push.sendToUser).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'How was Bloom Florals?', data: { type: 'booking', bookingId: 'b1' } }));
    expect(mail.sendBookingNotification).toHaveBeenCalledWith(expect.objectContaining({ ctaUrl: 'https://vendly.test/bookings/b1' }));
  });

  it('one failing job does not stop the others', async () => {
    const { service, prisma } = setup();
    prisma.booking.findMany.mockRejectedValueOnce(new Error('db blip'));
    await expect(service.hourly()).resolves.toBeUndefined();
    expect(prisma.booking.findMany).toHaveBeenCalledTimes(3); // the next jobs still ran (expire, reviews)
  });
});
