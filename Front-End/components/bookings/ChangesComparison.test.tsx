import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChangesComparison, { comparisonRows } from './ChangesComparison';
import RequestChangesCard from './RequestChangesCard';
import dayjs from 'dayjs';
import { draftFrom, draftPayload, draftError, lineFor, moveStart, setEnd, type Comparison, type RequestTerms, type TermsLine } from '@/lib/request-changes';

jest.mock('@/service/booking/booking.service', () => ({
  BookingService: { changes: jest.fn(), approveChanges: jest.fn(), declineChanges: jest.fn(), withdrawChanges: jest.fn() },
}));
jest.mock('@/service/contracts/contracts.service', () => ({
  ContractsService: { get: jest.fn(), vendorList: jest.fn(), downloadLink: jest.fn() },
  apiError: (_e: unknown, fallback: string) => fallback,
}));
// the signing panel itself is tested on its own; here it just signs
jest.mock('@/components/contracts/SignContractPanel', () => ({
  __esModule: true,
  default: ({ submitLabel, onSubmit, contentSha256 }: any) => (
    <button type="button" onClick={() => onSubmit({ legal_name: 'Cara Customer', consent: true, content_sha256: contentSha256, signature_image: 'data:image/png;base64,x' })}>
      {submitLabel}
    </button>
  ),
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import { BookingService } from '@/service/booking/booking.service';
import { ContractsService } from '@/service/contracts/contracts.service';

const line = (over: Partial<TermsLine>): TermsLine => ({
  extra_id: 'x1', add_on_id: 'a1', kind: 'ADD_ON', name: 'Bartender', description: null, price_unit: 'PER_HOUR', unit_price: 50, quantity: 4, amount: 200, label: 'Bartender: $50.00 × 4 hours', usual_price: 50, ...over,
});
const before: RequestTerms = {
  scheduled_at: '2026-12-05T16:00:00.000Z',
  event_start_at: '2026-12-05T16:00:00.000Z',
  event_end_at: '2026-12-05T20:00:00.000Z',
  guest_count: 10,
  package: { unit: 'person', unit_price: 45, quantity: 10, amount: 450, label: '$45.00 per person × 10 guests' },
  lines: [line({}), line({ extra_id: 'x2', add_on_id: 'a2', name: 'Dessert table', price_unit: 'FIXED', unit_price: 100, quantity: 1, amount: 100, label: 'Dessert table' })],
  options: [{ group_id: 'g1', title: 'Style', amount: 20, options: [{ option_id: 'o1', label: 'Classic', price: 20, price_mode: 'FLAT', quantity: 1, amount: 20, price_text: '+$20.00' }] }],
  options_amount: 20,
  promo_code: null,
  discount: 0,
  price: 770,
  service_fee: 38.5,
  total: 808.5,
  plan: 'DEPOSIT_50',
  schedule: [{ label: 'Deposit (50%)', amount: 423.5, due_at: null }, { label: 'Balance', amount: 385, due_at: '2026-11-21T16:00:00.000Z' }],
};
const after: RequestTerms = {
  ...before,
  scheduled_at: '2026-12-06T16:00:00.000Z',
  event_start_at: '2026-12-06T16:00:00.000Z',
  event_end_at: '2026-12-06T20:00:00.000Z',
  guest_count: 12,
  package: { ...before.package, quantity: 12, amount: 540, label: '$45.00 per person × 12 guests' },
  lines: [line({ unit_price: 40, amount: 160, label: 'Bartender: $40.00 × 4 hours' }), line({ extra_id: null, add_on_id: 'a3', kind: 'FEE', name: 'Extra travel', price_unit: 'FIXED', unit_price: 55, quantity: 1, amount: 55, label: 'Extra travel', usual_price: 40 })],
  options: [{ group_id: 'g1', title: 'Style', amount: 35, options: [{ option_id: 'o2', label: 'Deluxe', price: 35, price_mode: 'FLAT', quantity: 1, amount: 35, price_text: '+$35.00' }] }],
  options_amount: 35,
  price: 790,
  service_fee: 39.5,
  total: 829.5,
  schedule: [{ label: 'Deposit (50%)', amount: 434.5, due_at: null }, { label: 'Balance', amount: 395, due_at: '2026-11-22T16:00:00.000Z' }],
};
const comparison: Comparison = {
  before,
  after,
  changes: ['Date and time', 'Guests: 10 to 12'],
  note: 'We can do Saturday instead.',
  promo_note: null,
  lines: [
    { key: 'x1', before: before.lines[0], after: after.lines[0] },
    { key: 'x2', before: before.lines[1], after: null },
    { key: 'new:a3', before: null, after: after.lines[1] },
  ],
};

beforeEach(() => jest.clearAllMocks());

describe('ChangesComparison', () => {
  it('shows each part of the request before and after, and highlights what changed', () => {
    render(<ChangesComparison comparison={comparison} vendorName="Party Pros" />);
    const table = screen.getByRole('table', { name: 'Changes to the request' });
    const row = (name: string) => within(table).getByRole('row', { name: new RegExp(`^${name}`) });

    expect(within(row('Guests')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['10', '12']);
    expect(row('Guests')).toHaveAttribute('data-changed');
    expect(row('Date')).toHaveAttribute('data-changed');
    expect(row('Add-on: Bartender')).toHaveTextContent('Bartender: $50.00 × 4 hours · $200.00');
    expect(row('Add-on: Bartender')).toHaveTextContent('Bartender: $40.00 × 4 hours · $160.00');
    expect(row('Add-on: Dessert table')).toHaveTextContent('Removed');
    expect(row('Fee: Extra travel')).toHaveTextContent('Not included');
    expect(row('Fee: Extra travel')).toHaveTextContent('Extra travel · $55.00');
    expect(row('Style')).toHaveTextContent('Classic · +$20.00');
    expect(row('Style')).toHaveTextContent('Deluxe · +$35.00');
    expect(row('Total')).toHaveTextContent('$808.50');
    expect(row('Total')).toHaveTextContent('$829.50');
    expect(row('Vendly Protection fee')).toHaveTextContent('$39.50');
    expect(row('Payments')).toHaveTextContent('Deposit (50%): $434.50 when accepted');
    // the note, and that nothing is charged yet
    expect(screen.getByText('We can do Saturday instead.')).toBeInTheDocument();
    expect(screen.getByText(/Note from Party Pros/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is charged until the vendor accepts/)).toBeInTheDocument();
  });

  it('does not highlight rows that stay the same, and shows a promo that drops off', () => {
    const same = { ...comparison, after: { ...after, guest_count: 10 }, promo_note: 'The promo code SAVE10 needs a booking of at least $1000.00, so it no longer applies.' };
    const rows = comparisonRows(same);
    expect(rows.find((r) => r.label === 'Guests')).toMatchObject({ before: '10', after: '10' });
    render(<ChangesComparison comparison={same} />);
    expect(screen.getByRole('row', { name: /^Guests/ })).not.toHaveAttribute('data-changed');
    expect(screen.getByText(/SAVE10 needs a booking of at least/)).toBeInTheDocument();
  });
});

describe('RequestChangesCard (customer)', () => {
  const proposal = { ...comparison, contract_id: 'c2', version: 2, status: 'WAITING', sent_at: '2026-11-01T00:00:00Z', vendor_name: 'Party Pros', signed_by: 'Vic Vendor', content_sha256: 'h'.repeat(64) };

  it('shows the suggestion and approves it with a signature on the updated contract', async () => {
    (BookingService.changes as jest.Mock).mockResolvedValue({ data: { data: { role: 'CUSTOMER', can_suggest: false, proposal, editor: null, consent_text: 'I agree' } } });
    (ContractsService.get as jest.Mock).mockResolvedValue({ data: { data: { title: 'Agreement', body: 'Body', content_sha256: 'h'.repeat(64), consent_text: 'I agree' } } });
    (BookingService.approveChanges as jest.Mock).mockResolvedValue({ data: { success: true } });
    const onChanged = jest.fn();
    const user = userEvent.setup();
    render(<RequestChangesCard bookingId="b1" role="CUSTOMER" bookingStatus="PENDING" otherName="Party Pros" onChanged={onChanged} />);

    expect(await screen.findByRole('heading', { name: 'Party Pros suggested changes' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Changes to the request' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve and sign' }));
    // the contract opens; signing approves
    await user.click(await screen.findByRole('button', { name: 'Approve and sign' }));
    await waitFor(() => expect(BookingService.approveChanges).toHaveBeenCalledWith('b1', expect.objectContaining({ content_sha256: 'h'.repeat(64), signature_image: expect.any(String) })));
    expect(ContractsService.get).toHaveBeenCalledWith('c2');
    expect(onChanged).toHaveBeenCalled();
  });

  it('declines with an optional reason, keeping the original request', async () => {
    (BookingService.changes as jest.Mock).mockResolvedValue({ data: { data: { role: 'CUSTOMER', can_suggest: false, proposal, editor: null, consent_text: '' } } });
    (BookingService.declineChanges as jest.Mock).mockResolvedValue({ data: { success: true } });
    jest.spyOn(window, 'prompt').mockReturnValue('Saturday doesn’t work');
    const user = userEvent.setup();
    render(<RequestChangesCard bookingId="b1" role="CUSTOMER" bookingStatus="PENDING" otherName="Party Pros" />);
    await user.click(await screen.findByRole('button', { name: 'Decline changes' }));
    expect(BookingService.declineChanges).toHaveBeenCalledWith('b1', 'Saturday doesn’t work');
  });

  it('shows nothing once the request is accepted', () => {
    const { container } = render(<RequestChangesCard bookingId="b1" role="CUSTOMER" bookingStatus="CONFIRMED" otherName="Party Pros" />);
    expect(container).toBeEmptyDOMElement();
    expect(BookingService.changes).not.toHaveBeenCalled();
  });
});

describe('the vendor’s editor helpers', () => {
  it('keeps a multi-day event’s length when the start moves, and sends the end only when the vendor sets it', () => {
    // Friday morning to Sunday evening
    const weekend: RequestTerms = { ...before, scheduled_at: '2026-12-04T10:00:00.000Z', event_start_at: '2026-12-04T10:00:00.000Z', event_end_at: '2026-12-06T18:00:00.000Z' };
    const initial = draftFrom(weekend);
    expect(initial.endDate).toBe(dayjs(weekend.event_end_at).format('YYYY-MM-DD'));
    expect(initial.endDate).not.toBe(initial.date);

    // a week later: the end moves with it (the server does the same with the start alone)
    const nextWeek = moveStart(initial, dayjs(weekend.event_start_at).add(7, 'day').format('YYYY-MM-DD'), initial.start);
    expect(nextWeek.endDate).toBe(dayjs(weekend.event_end_at).add(7, 'day').format('YYYY-MM-DD'));
    expect(nextWeek.end).toBe(initial.end);
    const body = draftPayload(nextWeek, initial, []);
    expect(body.event_start_at).toBe(dayjs(weekend.event_start_at).add(7, 'day').toISOString());
    expect(body).not.toHaveProperty('event_end_at');

    // a later start time moves the end by as much
    const later = moveStart(initial, initial.date, dayjs(weekend.event_start_at).add(2, 'hour').format('HH:mm'));
    expect(dayjs(`${later.endDate}T${later.end}`).toISOString()).toBe(dayjs(weekend.event_end_at).add(2, 'hour').toISOString());

    // the vendor sets the end themselves: it is sent on its own date, still days after the start
    const shorter = setEnd(nextWeek, dayjs(weekend.event_end_at).add(6, 'day').format('YYYY-MM-DD'), nextWeek.end);
    const sent = draftPayload(shorter, initial, []);
    expect(sent.event_end_at).toBe(dayjs(weekend.event_end_at).add(6, 'day').toISOString());
    expect(new Date(sent.event_end_at as string).getTime() - new Date(sent.event_start_at as string).getTime()).toBe(32 * 3600e3);
    expect(draftError({ ...shorter, endDate: dayjs(weekend.event_start_at).subtract(1, 'day').format('YYYY-MM-DD') })).toMatch(/end date/);
  });

  it('fills the editor from the request and sends only what changed, with every line priced', () => {
    const initial = draftFrom(before);
    expect(initial.guests).toBe('10');
    expect(initial.lines.map((l) => [l.name, l.unit_price, l.quantity])).toEqual([['Bartender', '50', '4'], ['Dessert table', '100', '1']]);
    expect(initial.picks).toEqual({ g1: ['o1'] });
    const groups = [{ id: 'g1', title: 'Style', required: true, max_select: 1, options: [{ id: 'o1', label: 'Classic', price: 20, price_mode: 'FLAT' as const, price_text: '+$20.00' }, { id: 'o2', label: 'Deluxe', price: 35, price_mode: 'FLAT' as const, price_text: '+$35.00' }] }];
    const edited = {
      ...initial,
      guests: '12',
      lines: [{ ...initial.lines[0], unit_price: '40' }, lineFor({ id: 'a3', kind: 'FEE', name: 'Extra travel', description: null, price: 40, price_unit: 'FIXED' })],
      picks: { g1: ['o2'] },
      note: ' Saturday instead ',
    };
    expect(draftPayload(edited, initial, groups)).toEqual({
      lines: [{ extra_id: 'x1', unit_price: 40 }, { add_on_id: 'a3', quantity: 1, unit_price: 40 }],
      options: [{ group_id: 'g1', option_ids: ['o2'] }],
      guest_count: 12,
      note: 'Saturday instead',
    });
    expect(draftError({ ...edited, lines: [{ ...edited.lines[0], unit_price: '-1' }] })).toMatch(/between \$0 and \$100,000/);
    expect(draftError({ ...edited, picks: {} }, { customizations: groups })).toBe('Choose an option for “Style”.');
    expect(draftError({ ...edited, guests: '' }, { needsGuests: true })).toMatch(/how many guests/);
    expect(draftError(edited, { customizations: groups })).toBeNull();
  });
});
