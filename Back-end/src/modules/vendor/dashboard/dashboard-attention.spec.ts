import { ForbiddenException } from '@nestjs/common';
import { BookingContractStatus, BookingStatus, InstallmentStatus } from 'prisma/generated/enums';
import {
  AttentionItem,
  capPerKind,
  chatItems,
  disputeItems,
  extraItems,
  MAX_PER_KIND,
  PaymentRow,
  paymentItems,
  PendingRow,
  rentalItems,
  requestItems,
  sortAttention,
  titleOf,
} from './dashboard-attention';
import { VendorDashboardController } from './dashboard.controller';

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({ TanvirStorage: { url: (p: string) => `https://cdn.test/${p}` } }));

const NOW = new Date('2026-11-10T12:00:00Z');
const HOUR = 3600e3;
const proposal = { request_changes: { after: { total: 1 } } };

const pending = (over: Partial<PendingRow> = {}): PendingRow => ({
  id: 'b1',
  created_at: new Date(NOW.getTime() - 10 * HOUR),
  request_opened_at: null,
  event_start_at: new Date('2026-12-01T18:00:00Z'),
  listing: { title: 'Party DJ' },
  customer: { name: 'Ana Lee' },
  contracts: [],
  ...over,
});
const contract = (status: string, over: Record<string, unknown> = {}) => ({ status, void_reason: null, supersedes_id: 'c1', version: 2, merge_data: proposal, ...over });

describe('requestItems', () => {
  it('lists an open request with when it closes (72 hours after it was made)', () => {
    expect(requestItems([pending()], NOW)).toEqual([
      { kind: 'request', booking_id: 'b1', title: 'Party DJ', customer_name: 'Ana Lee', at: new Date(NOW.getTime() + 62 * HOUR) },
    ]);
  });

  it('closes when the event starts if that is sooner', () => {
    const start = new Date(NOW.getTime() + 5 * HOUR);
    expect(requestItems([pending({ event_start_at: start })], NOW)[0].at).toEqual(start);
  });

  it('leaves out requests that are already past their time', () => {
    expect(requestItems([pending({ created_at: new Date(NOW.getTime() - 80 * HOUR) })], NOW)).toEqual([]);
  });

  it("leaves out requests whose changes are with the customer, or waiting for a planner's client", () => {
    expect(requestItems([pending({ contracts: [contract(BookingContractStatus.AWAITING_CUSTOMER)] })], NOW)).toEqual([]);
    expect(requestItems([pending({ contracts: [contract(BookingContractStatus.AWAITING_CLIENT, { supersedes_id: null, merge_data: {} })] })], NOW)).toEqual([]);
  });

  it("tells approved and declined suggestions apart, by the latest one", () => {
    expect(requestItems([pending({ contracts: [contract(BookingContractStatus.AWAITING_VENDOR)] })], NOW)[0].kind).toBe('changes_approved');
    const declined = contract(BookingContractStatus.VOID, { void_reason: 'Declined by the customer' });
    expect(requestItems([pending({ contracts: [declined] })], NOW)[0].kind).toBe('changes_declined');
    // withdrawn by the vendor after the decline: just a request again
    const withdrawn = contract(BookingContractStatus.VOID, { void_reason: 'Withdrawn by the vendor', version: 3 });
    expect(requestItems([pending({ contracts: [declined, withdrawn] })], NOW)[0].kind).toBe('request');
  });

  it('ignores amendments that are not suggested changes', () => {
    expect(requestItems([pending({ contracts: [contract(BookingContractStatus.AWAITING_VENDOR, { merge_data: { other: true } })] })], NOW)[0].kind).toBe('request');
  });
});

describe('paymentItems', () => {
  const row = (over: Partial<PaymentRow> = {}): PaymentRow => ({
    id: 'b2',
    status: BookingStatus.CONFIRMED,
    payment_due_by: null,
    payment_due_kind: null,
    listing: { title: 'Photo shoot' },
    customer: { name: 'Bo' },
    installments: [],
    ...over,
  });
  const inst = (over: Record<string, unknown> = {}) => ({ status: InstallmentStatus.FAILED, kind: 'charge', label: 'Late fee', amount: '40.00', attempts: 3, last_error: 'Card declined', due_at: NOW, ...over });

  it('shows a missed deposit with its pay-by time', () => {
    const due = new Date(NOW.getTime() + 6 * HOUR);
    expect(paymentItems([row({ payment_due_by: due, payment_due_kind: 'deposit', installments: [inst()] })])).toEqual([
      { kind: 'payment', booking_id: 'b2', title: 'Photo shoot', customer_name: 'Bo', at: due, detail: 'deposit' },
    ]);
  });

  it('shows a failed charge, and one being retried', () => {
    expect(paymentItems([row({ status: BookingStatus.COMPLETED, installments: [inst()] })])[0]).toMatchObject({ detail: 'Late fee', amount: 40, done: false });
    expect(paymentItems([row({ installments: [inst({ status: InstallmentStatus.SCHEDULED, attempts: 1 })] })])[0]).toMatchObject({ done: true });
  });

  it('leaves out rental security holds and charges that have not been tried', () => {
    expect(paymentItems([row({ installments: [inst({ kind: 'security_deposit' }), inst({ status: InstallmentStatus.SCHEDULED, attempts: 0, last_error: null })] })])).toEqual([]);
  });
});

describe('the other lists', () => {
  it('complaints say whether the vendor replied', () => {
    const items = disputeItems([{ id: 'b3', dispute_opened_at: NOW, dispute_category: 'no_show', dispute_vendor_replied_at: null, listing: null, customer: { name: 'Cy' } }]);
    expect(items[0]).toMatchObject({ kind: 'dispute', detail: 'no_show', done: false, title: null });
  });

  it('a rental is due back on its earliest return date and named after its items', () => {
    const items = rentalItems([
      {
        id: 'b4',
        listing: null,
        customer: { name: 'Di' },
        rental_reservations: [
          { end_date: new Date('2026-11-09T00:00:00Z'), item: { title: 'Chairs' } },
          { end_date: new Date('2026-11-08T00:00:00Z'), item: { title: 'Tables' } },
        ],
      },
    ]);
    expect(items[0]).toMatchObject({ kind: 'rental_return', title: 'Chairs and 1 more', at: new Date('2026-11-08T00:00:00Z') });
  });

  it('add-ons and fees waiting on the customer', () => {
    const items = extraItems([{ created_at: NOW, kind: 'FEE', name: 'Travel fee', amount: '25.5', fee_amount: 0, booking: { id: 'b5', listing: { title: 'DJ' }, customer: { name: 'Ed' } } }]);
    expect(items[0]).toMatchObject({ kind: 'extra_waiting', booking_id: 'b5', detail: 'Travel fee', amount: 25.5 });
  });

  it('unread chats become one row, or none', () => {
    expect(chatItems([])).toEqual([]);
    expect(chatItems([{ conversationId: 'a', messages: 2 }, { conversationId: 'b', messages: 0 }, { conversationId: 'c', messages: 1 }])).toEqual([
      { kind: 'unread_chats', booking_id: null, title: null, customer_name: null, at: null, chats: 2, messages: 3 },
    ]);
  });

  it('titleOf: the package first, then the rented items', () => {
    expect(titleOf({ listing: { title: 'DJ' }, rental_reservations: [{ item: { title: 'Chairs' } }] })).toBe('DJ');
    expect(titleOf({ listing: null, rental_reservations: [] })).toBeNull();
  });
});

describe('sorting and capping', () => {
  const item = (kind: AttentionItem['kind'], at: string | null): AttentionItem => ({ kind, booking_id: null, title: null, customer_name: null, at: at ? new Date(at) : null });

  it('puts the most urgent kinds first, soonest first within a kind', () => {
    const sorted = sortAttention([item('unread_chats', null), item('payment', '2026-11-11'), item('request', '2026-11-12'), item('request', '2026-11-11')]);
    expect(sorted.map((i) => [i.kind, i.at?.toISOString().slice(0, 10)])).toEqual([
      ['request', '2026-11-11'],
      ['request', '2026-11-12'],
      ['payment', '2026-11-11'],
      ['unread_chats', undefined],
    ]);
  });

  it('keeps at most MAX_PER_KIND of each kind', () => {
    const many = Array.from({ length: MAX_PER_KIND + 3 }, () => item('extra_waiting', '2026-11-01'));
    expect(capPerKind([...many, item('dispute', null)])).toHaveLength(MAX_PER_KIND + 1);
  });
});

describe('GET /vendor/dashboard', () => {
  it('is for vendors only', () => {
    const service = { home: jest.fn().mockResolvedValue({ success: true }) };
    const controller = new VendorDashboardController(service as any);
    expect(() => controller.home({ id: 'u1', type: 'CUSTOMER' })).toThrow(ForbiddenException);
    expect(service.home).not.toHaveBeenCalled();
    controller.home({ id: 'v1', type: 'VENDOR' });
    expect(service.home).toHaveBeenCalledWith('v1');
  });
});
