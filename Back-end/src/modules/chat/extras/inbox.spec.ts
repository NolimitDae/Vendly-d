import { BookingContractStatus, BookingStatus } from 'prisma/generated/client';
import { acceptedBookingWhere, classifyConversation, clientBookingWhere } from './inbox';

const S = BookingStatus;

describe('vendor inbox tabs', () => {
  const statuses = new Map<string, BookingStatus[]>([
    ['pending', [S.PENDING]],
    ['confirmed', [S.CONFIRMED]],
    ['working', [S.IN_PROGRESS]],
    ['done', [S.COMPLETED]],
    ['done-and-new', [S.COMPLETED, S.PENDING]],
    ['cancelled-after-accepting', [S.CANCELLED]],
  ]);

  it.each(['pending', 'confirmed', 'working'])('a customer with a %s booking is a current client', (who) => {
    expect(classifyConversation({ is_group: false, counterpart: who }, statuses)).toEqual({ tab: 'clients', current: true });
  });

  it('a past client (completed or cancelled after accepting) is a client, listed after current ones', () => {
    expect(classifyConversation({ is_group: false, counterpart: 'done' }, statuses)).toEqual({ tab: 'clients', current: false });
    expect(classifyConversation({ is_group: false, counterpart: 'cancelled-after-accepting' }, statuses)).toEqual({ tab: 'clients', current: false });
    expect(classifyConversation({ is_group: false, counterpart: 'done-and-new' }, statuses)).toEqual({ tab: 'clients', current: true });
  });

  it('everyone else is an inquiry', () => {
    expect(classifyConversation({ is_group: false, counterpart: 'stranger' }, statuses)).toEqual({ tab: 'inquiries', current: false });
    expect(classifyConversation({ is_group: false, counterpart: null }, statuses)).toEqual({ tab: 'inquiries', current: false });
  });

  it('event group chats are always with clients', () => {
    expect(classifyConversation({ is_group: true, counterpart: null }, statuses).tab).toBe('clients');
    expect(classifyConversation({ is_group: true, counterpart: 'confirmed' }, statuses)).toEqual({ tab: 'clients', current: true });
  });

  it('client bookings: pending, accepted ones, and cancelled ones only if they had been accepted', () => {
    expect(clientBookingWhere).toEqual({
      deleted_at: null,
      OR: [
        { status: { in: [S.PENDING, S.CONFIRMED, S.IN_PROGRESS, S.COMPLETED] } },
        {
          status: S.CANCELLED,
          OR: [{ paid_at: { not: null } }, { installments: { some: {} } }, { contracts: { some: { status: BookingContractStatus.EXECUTED } } }],
        },
      ],
    });
    // declined and expired requests (REJECTED) never make a client
    expect(JSON.stringify(clientBookingWhere)).not.toContain(S.REJECTED);
  });

  it('accepted bookings (they lift the message limit) leave out pending requests', () => {
    expect(JSON.stringify(acceptedBookingWhere)).not.toContain(`"${S.PENDING}"`);
    expect(JSON.stringify(acceptedBookingWhere)).toContain(S.CONFIRMED);
  });
});
