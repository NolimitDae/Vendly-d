import { BadRequestException, ConflictException } from '@nestjs/common';
import { BookingContractsService, CHANGES_WAITING_MESSAGE } from './booking-contracts.service';
import {
  CatalogItem,
  describeChanges,
  ExistingLine,
  isProposal,
  MAX_LINE_PRICE,
  packageForProposal,
  packageOnRequest,
  pairLines,
  priceProposalLines,
  readProposal,
  reopenedAt,
  RequestChangeError,
  RequestTerms,
  sameTerms,
  withChosenPrices,
} from './request-changes';
import { RequestChangesService } from './request-changes.service';

const HOUR = 3600e3;
const start = new Date('2026-12-05T16:00:00Z');
const end = new Date(start.getTime() + 4 * HOUR);
const ev = { guest_count: 10, event_start_at: start, event_end_at: end };

const bartender: ExistingLine = { id: 'x1', add_on_id: 'a-bar', kind: 'ADD_ON', name: 'Bartender', description: null, price_unit: 'PER_HOUR', unit_price: 50, quantity: 4, amount: 200 };
const dessert: ExistingLine = { id: 'x2', add_on_id: 'a-des', kind: 'ADD_ON', name: 'Dessert table', description: 'Sweet things', price_unit: 'FIXED', unit_price: 100, quantity: 1, amount: 100 };
const catalog: CatalogItem[] = [
  { id: 'a-bar', kind: 'ADD_ON', name: 'Bartender', description: null, price: 60, price_unit: 'PER_HOUR' },
  { id: 'a-des', kind: 'ADD_ON', name: 'Dessert table', description: null, price: 100, price_unit: 'FIXED' },
  { id: 'a-trv', kind: 'FEE', name: 'Extra travel', price: 40, description: null, price_unit: 'FIXED' },
  { id: 'a-pp', kind: 'ADD_ON', name: 'Favors', price: 3, description: null, price_unit: 'PER_PERSON' },
  { id: 'a-chair', kind: 'ADD_ON', name: 'Chair', price: 2.5, description: null, price_unit: 'PER_ITEM' },
];
const price = (inputs: any[], e: any = ev) => priceProposalLines(inputs, [bartender, dessert], catalog, e);

describe('pricing the add-ons and fees of suggested changes', () => {
  it('reprices a line for this booking, keeps one, adds a fee and drops what is left out', () => {
    const lines = price([{ extra_id: 'x1', unit_price: 40 }, { add_on_id: 'a-trv', unit_price: 55 }]);
    expect(lines.map((l) => [l.name, l.kind, l.unit_price, l.quantity, l.amount, l.label, l.usual_price])).toEqual([
      ['Bartender', 'ADD_ON', 40, 4, 160, 'Bartender: $40.00 × 4 hours', 50],
      ['Extra travel', 'FEE', 55, 1, 55, 'Extra travel', 40],
    ]);
    // an existing line keeps its own price (not today's list price) unless the vendor sets one
    expect(price([{ extra_id: 'x1' }])[0]).toMatchObject({ unit_price: 50, amount: 200 });
    // a new line starts from the list price
    expect(price([{ add_on_id: 'a-trv' }])[0]).toMatchObject({ unit_price: 40, amount: 40 });
  });

  it('per person and per hour lines follow the new guests and hours; fixed and per item lines take a quantity', () => {
    const later = { guest_count: 12, event_start_at: start, event_end_at: new Date(start.getTime() + 6 * HOUR) };
    const lines = price([{ extra_id: 'x1' }, { add_on_id: 'a-pp' }, { extra_id: 'x2', quantity: 2 }, { add_on_id: 'a-chair', quantity: 40 }], later);
    expect(lines.map((l) => [l.quantity, l.amount, l.label])).toEqual([
      [6, 300, 'Bartender: $50.00 × 6 hours'],
      [12, 36, 'Favors: $3.00 × 12 guests'],
      [2, 200, 'Dessert table × 2'],
      [40, 100, 'Chair × 40'],
    ]);
    // a quantity sent for a per person line is ignored: the guests count
    expect(price([{ add_on_id: 'a-pp', quantity: 99 }])[0].quantity).toBe(10);
  });

  it('refuses prices out of bounds, bad quantities, duplicates and add-ons that aren’t the vendor’s', () => {
    expect(() => price([{ extra_id: 'x1', unit_price: -1 }])).toThrow(RequestChangeError);
    expect(() => price([{ extra_id: 'x1', unit_price: MAX_LINE_PRICE + 1 }])).toThrow(/between \$0 and \$100,000/);
    expect(() => price([{ extra_id: 'x1', unit_price: 10.005 }])).toThrow(/dollars and cents/);
    expect(() => price([{ extra_id: 'x1', unit_price: Number.NaN }])).toThrow(RequestChangeError);
    expect(() => price([{ extra_id: 'x2', quantity: 0 }])).toThrow(/whole number from 1 to 999/);
    expect(() => price([{ extra_id: 'x2', quantity: 1.5 }])).toThrow(/whole number/);
    expect(() => price([{ extra_id: 'x1' }, { extra_id: 'x1' }])).toThrow(/listed twice/);
    // the same add-on can't come in again next to its own line
    expect(() => price([{ extra_id: 'x1' }, { add_on_id: 'a-bar' }])).toThrow(/listed twice/);
    expect(() => price([{ add_on_id: 'a-trv' }, { add_on_id: 'a-trv' }])).toThrow(/listed twice/);
    expect(() => price([{ add_on_id: 'someone-elses' }])).toThrow(/isn’t available/);
    expect(() => price([{ extra_id: 'gone' }])).toThrow(/no longer on this request/);
    expect(() => price([{ add_on_id: 'a-pp' }], { ...ev, guest_count: null })).toThrow(/how many guests/);
    expect(() => price([{ extra_id: 'x1' }], { ...ev, event_end_at: null })).toThrow(/end time/);
    expect(() => price(Array.from({ length: 31 }, () => ({ add_on_id: 'a-trv' })))).toThrow(/up to 30/);
    // a free line is fine
    expect(price([{ extra_id: 'x2', unit_price: 0 }])[0].amount).toBe(0);
  });
});

describe('the package line', () => {
  it('works the unit price back from the request and counts it again on the new guests, at that price', () => {
    const before = packageOnRequest({ amount: 450, unit: 'person', ev });
    expect(before).toMatchObject({ unit: 'person', unit_price: 45, quantity: 10, amount: 450, label: '$45.00 per person × 10 guests' });
    expect(packageForProposal(before, { ...ev, guest_count: 12 })).toMatchObject({ quantity: 12, amount: 540, label: '$45.00 per person × 12 guests' });
    // unchanged guests keep the exact amount
    expect(packageForProposal(before, ev)).toBe(before);
  });

  it('hours bill at least the package minimum; flat packages and quotes never change', () => {
    const byHour = packageOnRequest({ amount: 300, unit: 'hour', minQuantity: 3, ev: { event_start_at: start, event_end_at: new Date(start.getTime() + 2 * HOUR) } });
    expect(byHour).toMatchObject({ unit_price: 100, quantity: 3 });
    expect(packageForProposal(byHour, { event_start_at: start, event_end_at: new Date(start.getTime() + 1 * HOUR) }, 3).amount).toBe(300);
    expect(packageForProposal(byHour, { event_start_at: start, event_end_at: new Date(start.getTime() + 5 * HOUR) }, 3).amount).toBe(500);
    const flat = packageOnRequest({ amount: 900, unit: 'fixed', ev });
    expect(packageForProposal(flat, { ...ev, guest_count: 200 })).toBe(flat);
    expect(packageOnRequest({ amount: 1200, unit: 'person', quoteTitle: 'Gala', ev })).toMatchObject({ unit: 'fixed', amount: 1200, label: 'Quote: Gala' });
  });
});

describe('customizations keep the price they were chosen at', () => {
  it('uses the request’s price for options already chosen, and today’s for new ones', () => {
    const offered = [{ id: 'g', title: 'Style', required: true, max_select: 1, options: [{ id: 'o1', label: 'Classic', price: 30, price_mode: 'FLAT' as const }, { id: 'o2', label: 'Deluxe', price: 35, price_mode: 'FLAT' as const }] }];
    const chosen = [{ group_id: 'g', title: 'Style', amount: 20, options: [{ option_id: 'o1', label: 'Classic', price: 20, price_mode: 'FLAT' as const, quantity: 1, amount: 20, price_text: '+$20.00' }] }];
    const out = withChosenPrices(offered, chosen);
    expect(out[0].options.map((o) => o.price)).toEqual([20, 35]);
  });
});

const terms = (over: Partial<RequestTerms> = {}): RequestTerms => ({
  scheduled_at: start.toISOString(),
  event_start_at: start.toISOString(),
  event_end_at: end.toISOString(),
  guest_count: 10,
  package: { unit: 'person', unit_price: 45, quantity: 10, amount: 450, label: '' },
  lines: price([{ extra_id: 'x1' }, { extra_id: 'x2' }]),
  options: [],
  options_amount: 0,
  promo_code: null,
  discount: 0,
  price: 750,
  service_fee: 37.5,
  total: 787.5,
  plan: 'FULL_ON_ACCEPT',
  schedule: [],
  ...over,
});

describe('what changed', () => {
  it('lists the changes in plain words and pairs up the lines for the comparison', () => {
    const before = terms();
    const after = terms({
      event_start_at: new Date(start.getTime() + 24 * HOUR).toISOString(),
      guest_count: 12,
      package: { ...before.package, quantity: 12, amount: 540 },
      lines: price([{ extra_id: 'x1', unit_price: 40 }, { add_on_id: 'a-trv' }]),
      price: 740,
    });
    expect(describeChanges(before, after)).toEqual([
      'Date and time',
      'Guests: 10 to 12',
      'Package: $450.00 to $540.00',
      'Bartender: $200.00 to $160.00',
      'New fee: Extra travel ($40.00)',
      'Removed add-on: Dessert table',
    ]);
    expect(pairLines(before, after).map((r) => [r.before?.name ?? null, r.after?.name ?? null])).toEqual([
      ['Bartender', 'Bartender'],
      ['Dessert table', null],
      [null, 'Extra travel'],
    ]);
    expect(sameTerms(before, terms())).toBe(true);
    expect(sameTerms(before, after)).toBe(false);
    expect(describeChanges(before, terms({ promo_code: null }))).toEqual([]);
    expect(describeChanges(terms({ promo_code: 'SAVE10' }), terms())).toEqual(['Promo SAVE10 removed']);
  });
});

describe('the request’s clock after an answer', () => {
  const now = new Date('2026-11-01T12:00:00Z');
  it('gives the vendor at least 48 hours from the answer, and never less than they had', () => {
    // opened long ago: the clock restarts so 48 hours are left
    expect(reopenedAt(new Date(now.getTime() - 200 * HOUR), now)).toEqual(new Date(now.getTime() - 24 * HOUR));
    // opened an hour ago: they keep their 71 hours
    const recent = new Date(now.getTime() - HOUR);
    expect(reopenedAt(recent, now)).toEqual(recent);
  });
});

describe('telling suggestions apart', () => {
  it('reads the suggestion stored with a contract version', () => {
    expect(readProposal({ request_changes: { after: terms() } })).toBeTruthy();
    expect(isProposal({ merge_data: { amendment_changes: { amount: 5 } } })).toBe(false);
    expect(isProposal({ merge_data: null })).toBe(false);
  });
});

describe('state rules', () => {
  const sha = 'a'.repeat(64);
  const sig = { legal_name: 'Vic Vendor', consent: true, content_sha256: sha, use_saved_signature: true } as any;
  const contractsService = (rows: any[]) => {
    const prisma: any = {
      bookingContract: { findMany: jest.fn().mockResolvedValue(rows), findUnique: jest.fn() },
      vendorProfile: { findUnique: jest.fn().mockResolvedValue({ saved_signature_key: 'sig.png' }) },
    };
    const s = new BookingContractsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any);
    const execute = jest.spyOn(s as any, 'execute').mockResolvedValue({ id: 'done' });
    return { s, prisma, execute };
  };
  const proposal = { request_changes: { after: {} } };

  it('the vendor can’t Accept & Sign the old terms while their suggestion waits for the customer', async () => {
    const { s, execute } = contractsService([
      { id: 'c2', version: 2, status: 'AWAITING_CUSTOMER', supersedes_id: 'c1', content_sha256: sha, merge_data: proposal },
      { id: 'c1', version: 1, status: 'AWAITING_VENDOR', supersedes_id: null, content_sha256: sha, merge_data: {} },
    ]);
    const p = s.countersignForBooking('b1', 'v', sig, {}, async () => null);
    await expect(p).rejects.toBeInstanceOf(ConflictException);
    await expect(p).rejects.toThrow(CHANGES_WAITING_MESSAGE);
    expect(execute).not.toHaveBeenCalled();
  });

  it('once the customer approves, Accept & Sign signs the new version', async () => {
    const { s, execute } = contractsService([
      { id: 'c2', version: 2, status: 'AWAITING_VENDOR', supersedes_id: 'c1', content_sha256: sha, merge_data: proposal },
      { id: 'c1', version: 1, status: 'SUPERSEDED', supersedes_id: null, content_sha256: sha, merge_data: {} },
    ]);
    await s.countersignForBooking('b1', 'v', sig, {}, async () => null);
    expect(execute).toHaveBeenCalledWith('c2', 'v', 'VENDOR', sig, 'sig.png', {}, expect.any(Function));
  });

  it('an amendment waiting for the vendor still isn’t accepted with Accept & Sign', async () => {
    const { s, execute } = contractsService([{ id: 'c2', version: 2, status: 'AWAITING_VENDOR', supersedes_id: 'c1', content_sha256: sha, merge_data: { amendment_changes: {} } }]);
    await expect(s.countersignForBooking('b1', 'v', sig, {}, async () => null)).rejects.toThrow('no contract waiting');
    expect(execute).not.toHaveBeenCalled();
  });

  it('suggestions are answered on the booking, not with the contract’s sign or decline', async () => {
    const { s, prisma } = contractsService([]);
    prisma.bookingContract.findUnique.mockResolvedValue({ status: 'AWAITING_CUSTOMER', merge_data: proposal });
    await expect(s.signAsParty('c2', { userId: 'cust' }, sig, {})).rejects.toBeInstanceOf(BadRequestException);
    jest.spyOn(s as any, 'contractForUser').mockResolvedValue({ contract: { id: 'c2', supersedes_id: 'c1', status: 'AWAITING_CUSTOMER', merge_data: proposal }, role: 'CUSTOMER' });
    await expect(s.declineAmendment('c2', { userId: 'cust' }, {})).rejects.toThrow(/Open the booking/);
  });

  it('the summary marks a suggestion as such, not as an amendment', () => {
    const { s } = contractsService([]);
    const summary = (s as any).summary({ id: 'c2', status: 'AWAITING_CUSTOMER', supersedes_id: 'c1', merge_data: proposal, signatures: [] }, 'CUSTOMER');
    expect(summary).toMatchObject({ is_proposal: true, is_amendment: false, can_sign: true });
  });

  describe('when the vendor can suggest changes', () => {
    const service = new RequestChangesService({} as any, {} as any, {} as any, {} as any, {} as any);
    const req = (over: any = {}) => ({ status: 'PENDING', listing_id: 'l1', listing: { id: 'l1' }, created_at: new Date(), request_opened_at: null, event_start_at: null, contracts: [{ id: 'c1', status: 'AWAITING_VENDOR', merge_data: {} }], ...over });
    const why = (b: any) => (service as any).cannotSuggest(b);

    it('on an open request with its contract waiting for the vendor', () => {
      expect(why(req())).toBeNull();
      // after the customer approved one, they can suggest again on the new version
      expect(why(req({ contracts: [{ id: 'c2', status: 'AWAITING_VENDOR', merge_data: proposal }] }))).toBeNull();
    });

    it('not twice at once, not before a planner’s client co-signs, not on rentals, accepted or expired requests', () => {
      expect(why(req({ contracts: [{ id: 'c2', status: 'AWAITING_CUSTOMER', merge_data: proposal }, { id: 'c1', status: 'AWAITING_VENDOR', merge_data: {} }] }))).toMatch(/already waiting/);
      expect(why(req({ contracts: [{ id: 'c1', status: 'AWAITING_CLIENT', merge_data: {} }] }))).toMatch(/client hasn’t co-signed/);
      expect(why(req({ listing_id: null, listing: null }))).toMatch(/rental/);
      expect(why(req({ status: 'CONFIRMED' }))).toMatch(/only be suggested while the request is waiting/);
      expect(why(req({ created_at: new Date(Date.now() - 80 * HOUR) }))).toMatch(/closed/);
      expect(why(req({ contracts: [] }))).toMatch(/no contract/);
    });
  });

  describe('a promo code on the request', () => {
    const promo = (row: any) => new RequestChangesService({ promoCode: { findUnique: jest.fn().mockResolvedValue(row) } } as any, {} as any, {} as any, {} as any, {} as any);
    it('stays applied, worked out on the new price', async () => {
      await expect((promo({ code: 'SAVE10', percent_off: 10, min_amount: null }) as any).promoFor('SAVE10', 800)).resolves.toEqual({ code: 'SAVE10', discount: 80, note: null });
    });
    it('drops off with a reason when the new price is under its minimum, or the code is gone', async () => {
      const under = await (promo({ code: 'BIG', amount_off: 50, min_amount: 500 }) as any).promoFor('BIG', 400);
      expect(under).toMatchObject({ code: null, discount: 0, note: expect.stringContaining('at least $500.00') });
      const gone = await (promo(null) as any).promoFor('OLD', 400);
      expect(gone.note).toMatch(/no longer exists/);
      expect(await (promo(null) as any).promoFor(null, 400)).toEqual({ code: null, discount: 0, note: null });
    });
  });
});
