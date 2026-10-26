import { ForbiddenException } from '@nestjs/common';
import { afterSend, assertUnderSendLimit, CUSTOMER_MESSAGE_LIMIT, sendLimitFor, sendLimitMessage } from './send-limit';

type U = { id: string; name: string | null; type: string | null; roles: string[]; vendorProfile?: { license_status: string } };
type M = { senderId: string; kind: string };

/** A tiny in-memory stand-in for the three queries the limit makes. */
function fakeDb(users: U[], messages: M[] = [], accepted = 0) {
  return {
    user: { findMany: jest.fn(async ({ where }: any) => users.filter((u) => where.id.in.includes(u.id)) as any) },
    message: {
      count: jest.fn(async ({ where }: any) =>
        messages.filter(
          (m) =>
            m.senderId === where.senderId &&
            (where.kind?.not ? m.kind !== where.kind.not : true) &&
            (where.kind?.in ? where.kind.in.includes(m.kind) : true),
        ).length,
      ),
    },
    booking: { count: jest.fn(async () => accepted) },
  };
}

const customer: U = { id: 'c1', name: 'Cara', type: 'CUSTOMER', roles: ['CUSTOMER'] };
const planner: U = { id: 'p1', name: 'Pat', type: 'EVENT_PLANNER', roles: ['EVENT_PLANNER'] };
const vendor: U = { id: 'v1', name: 'Bloom Florals', type: 'VENDOR', roles: ['VENDOR'], vendorProfile: { license_status: 'APPROVED' } };
const admin: U = { id: 'a1', name: 'Vendly Support', type: 'ADMIN', roles: ['ADMIN'] };
const conv = (a: string, b: string, is_group = false) => ({ id: 'conv', is_group, participants: [{ userId: a }, { userId: b }] });

describe('customer message limit', () => {
  it('counts only messages the customer typed (quotes, invites and system notices do not count)', async () => {
    const db = fakeDb([customer, vendor], [
      { senderId: 'c1', kind: 'text' },
      { senderId: 'c1', kind: 'invite' },
      { senderId: 'c1', kind: 'system' },
      { senderId: 'c1', kind: 'quote' },
    ]);
    const limit = await sendLimitFor(db, conv('c1', 'v1'), 'c1');
    expect(limit).toEqual({ limit: CUSTOMER_MESSAGE_LIMIT, used: 1, remaining: 2, vendor_name: 'Bloom Florals' });
  });

  it('stops the 4th typed message with a clear reason', async () => {
    const db = fakeDb([customer, vendor], [1, 2, 3].map(() => ({ senderId: 'c1', kind: 'text' })));
    await expect(assertUnderSendLimit(db, conv('c1', 'v1'), 'c1')).rejects.toThrow(ForbiddenException);
    await expect(assertUnderSendLimit(db, conv('c1', 'v1'), 'c1')).rejects.toThrow(
      "You can send 3 messages until Bloom Florals replies. They'll get back to you soon.",
    );
    expect(sendLimitMessage('Bloom Florals')).toContain('until Bloom Florals replies');
  });

  it('lets the first three through', async () => {
    const db = fakeDb([customer, vendor], [1, 2].map(() => ({ senderId: 'c1', kind: 'text' })));
    const limit = await assertUnderSendLimit(db, conv('c1', 'v1'), 'c1');
    expect(limit?.remaining).toBe(1);
    expect(afterSend(limit)).toMatchObject({ used: 3, remaining: 0 });
  });

  it('unlocks once the vendor has replied in the chat', async () => {
    const db = fakeDb([customer, vendor], [...[1, 2, 3].map(() => ({ senderId: 'c1', kind: 'text' })), { senderId: 'v1', kind: 'text' }]);
    expect(await sendLimitFor(db, conv('c1', 'v1'), 'c1')).toBeNull();
    await expect(assertUnderSendLimit(db, conv('c1', 'v1'), 'c1')).resolves.toBeNull();
  });

  it('a quote from the vendor counts as a reply, a system notice does not', async () => {
    const typed = [1, 2, 3].map(() => ({ senderId: 'c1', kind: 'text' }));
    expect(await sendLimitFor(fakeDb([customer, vendor], [...typed, { senderId: 'v1', kind: 'quote' }]), conv('c1', 'v1'), 'c1')).toBeNull();
    expect(await sendLimitFor(fakeDb([customer, vendor], [...typed, { senderId: 'v1', kind: 'system' }]), conv('c1', 'v1'), 'c1')).not.toBeNull();
  });

  it('unlocks once the vendor has accepted a booking with the customer', async () => {
    const db = fakeDb([customer, vendor], [1, 2, 3].map(() => ({ senderId: 'c1', kind: 'text' })), 1);
    expect(await sendLimitFor(db, conv('c1', 'v1'), 'c1')).toBeNull();
    // asked for accepted bookings between these two only
    expect(db.booking.count).toHaveBeenCalledWith({ where: expect.objectContaining({ customer_id: 'c1', vendor_id: 'v1', deleted_at: null }) });
  });

  it('applies to a planner writing to a vendor', async () => {
    const db = fakeDb([planner, vendor], [1, 2, 3].map(() => ({ senderId: 'p1', kind: 'text' })));
    await expect(assertUnderSendLimit(db, conv('p1', 'v1'), 'p1')).rejects.toThrow(ForbiddenException);
  });

  it('never limits a vendor', async () => {
    const db = fakeDb([customer, vendor], [1, 2, 3, 4].map(() => ({ senderId: 'v1', kind: 'text' })));
    expect(await sendLimitFor(db, conv('v1', 'c1'), 'v1')).toBeNull();
    // nor one vendor writing to another
    const other: U = { id: 'v2', name: 'Other', type: 'VENDOR', roles: ['VENDOR'], vendorProfile: { license_status: 'APPROVED' } };
    expect(await sendLimitFor(fakeDb([vendor, other]), conv('v1', 'v2'), 'v1')).toBeNull();
  });

  it('switching to the vendor role is not enough: a vendor not yet approved is limited like a customer', async () => {
    const switched: U = { id: 'c9', name: 'Cara', type: 'VENDOR', roles: ['CUSTOMER', 'VENDOR'], vendorProfile: { license_status: 'PENDING' } };
    const db = fakeDb([switched, vendor], [1, 2, 3].map(() => ({ senderId: 'c9', kind: 'text' })));
    await expect(assertUnderSendLimit(db, conv('c9', 'v1'), 'c9')).rejects.toThrow(ForbiddenException);
  });

  it('stays lifted once the vendor has replied, even if that reply was deleted', async () => {
    const db = fakeDb([customer, vendor], [1, 2, 3, 4].map(() => ({ senderId: 'c1', kind: 'text' })));
    expect(await sendLimitFor(db, { ...conv('c1', 'v1'), vendor_replied_at: new Date() }, 'c1')).toBeNull();
  });

  it('never limits admins, chats with support, chats with non-vendors or group chats', async () => {
    expect(await sendLimitFor(fakeDb([admin, vendor]), conv('a1', 'v1'), 'a1')).toBeNull();
    expect(await sendLimitFor(fakeDb([customer, admin]), conv('c1', 'a1'), 'c1')).toBeNull();
    expect(await sendLimitFor(fakeDb([customer, planner]), conv('c1', 'p1'), 'c1')).toBeNull();
    expect(await sendLimitFor(fakeDb([customer, vendor]), conv('c1', 'v1', true), 'c1')).toBeNull();
  });

  it('treats someone holding the vendor role (but signed in as a customer) as the vendor they are writing to', async () => {
    const multi: U = { id: 'v3', name: 'Sam', type: 'CUSTOMER', roles: ['CUSTOMER', 'VENDOR'] };
    const limit = await sendLimitFor(fakeDb([customer, multi]), conv('c1', 'v3'), 'c1');
    expect(limit?.remaining).toBe(3);
  });
});
