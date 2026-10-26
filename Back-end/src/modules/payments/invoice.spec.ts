import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { InvoiceService, invoiceNumber } from './invoice.service';

jest.mock('src/config/app.config', () => ({ __esModule: true, default: () => ({ app: { url: 'https://api.test', client_app_url: 'https://app.test' } }) }));

const d = (s: string) => new Date(`${s}T12:00:00Z`);

/** $1,000 package + $200 add-on at booking, $100 promo, $150 add-on and $60 fee approved later. */
const booking = (over: Record<string, unknown> = {}) => ({
  id: 'ckbooking12345678',
  status: 'COMPLETED',
  customer_id: 'c1',
  vendor_id: 'v1',
  amount: 1100,
  service_fee: 55,
  discount: 100,
  promo_code: 'SPRING',
  currency: 'usd',
  created_at: d('2026-08-01'),
  completed_at: d('2026-09-14'),
  cancelled_at: null,
  event_start_at: d('2026-09-14'),
  scheduled_at: null,
  paid_at: d('2026-08-02'),
  released_at: d('2026-09-17'),
  payout_credited_at: d('2026-09-17'),
  commission_amount: 125,
  released_gross: 1250,
  early_released_amount: 0,
  listing: { title: 'Wedding Photography' },
  rental_reservations: [],
  customer: { name: 'Amara Obi', email: 'amara@x.com' },
  vendor: { name: 'Jo', email: 'jo@x.com', vendorProfile: { business_name: 'Jo Shoots' } },
  installments: [
    { id: 'i1', sequence: 1, label: '50% deposit', kind: 'charge', status: 'PAID', amount: 605, fee_amount: 55, refunded_amount: 0, capture_manually: false, paid_at: d('2026-08-02'), due_at: d('2026-08-02'), updated_at: d('2026-08-02'), paid_out_at: d('2026-09-17'), extra: null },
    { id: 'i2', sequence: 2, label: 'Balance', kind: 'charge', status: 'PAID', amount: 550, fee_amount: 0, refunded_amount: 50, capture_manually: false, paid_at: d('2026-09-07'), due_at: d('2026-09-07'), updated_at: d('2026-09-15'), paid_out_at: d('2026-09-17'), extra: null },
    { id: 'i3', sequence: 3, label: 'Add-on: Second shooter', kind: 'extra', status: 'PAID', amount: 157.5, fee_amount: 7.5, refunded_amount: 0, capture_manually: false, paid_at: d('2026-09-01'), due_at: d('2026-09-01'), updated_at: d('2026-09-01'), paid_out_at: d('2026-09-17'), extra: { kind: 'ADD_ON' } },
    { id: 'i4', sequence: 4, label: 'Fee: Overtime', kind: 'extra', status: 'FAILED', amount: 60, fee_amount: 0, refunded_amount: 0, capture_manually: false, paid_at: null, due_at: d('2026-09-15'), updated_at: d('2026-09-15'), paid_out_at: null, extra: { kind: 'FEE' } },
  ],
  extras: [
    { kind: 'ADD_ON', name: 'Album', amount: 200, fee_amount: 0, status: 'INCLUDED' },
    { kind: 'ADD_ON', name: 'Second shooter', amount: 150, fee_amount: 7.5, status: 'APPROVED' },
    { kind: 'FEE', name: 'Overtime', amount: 60, fee_amount: 0, status: 'APPROVED' },
  ],
  contracts: [{ merge_data: { pricing_schedule: '## Schedule A\n- Package: 8 hours coverage = $1,000.00\n- Add-on: Album = $200.00' } }],
  ...over,
});

function setup(b: any, extra: { refunds?: any[]; givenBack?: number; user?: any } = {}) {
  const prisma = {
    booking: { findFirst: jest.fn().mockResolvedValue(b) },
    paymentTransaction: {
      findMany: jest.fn().mockResolvedValue(extra.refunds ?? []),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: extra.givenBack ?? null } }),
    },
    user: { findUnique: jest.fn().mockResolvedValue(extra.user ?? null) },
  };
  return new InvoiceService(prisma as any);
}

describe('final invoice', () => {
  it('lists the package, add-ons, promo, later add-ons and fees, the Vendly Protection fee, charges and refunds', async () => {
    const inv = await setup(booking(), { givenBack: 50 }).invoiceFor('ckbooking12345678', { id: 'c1' });
    expect(inv.number).toBe('INV-12345678');
    expect(inv.copy).toBe('customer');
    expect(inv.price_lines).toEqual([
      { label: 'Package: Wedding Photography (8 hours coverage)', amount: 1000 },
      { label: 'Add-on: Album', amount: 200 },
      { label: 'Promo SPRING', amount: -100 },
      { label: 'Add-on added later: Second shooter', amount: 150 },
      { label: 'Fee added later: Overtime', amount: 60 },
      { label: 'Vendly Protection fee', amount: 62.5 },
    ]);
    expect(inv.price_total).toBe(1372.5);
    expect(inv.charges.map((c) => [c.label, c.amount, c.status])).toEqual([
      ['50% deposit', 605, 'Paid'],
      ['Balance', 550, 'Paid, part refunded'],
      ['Add-on: Second shooter', 157.5, 'Paid'],
      ['Fee: Overtime', 60, 'Failed'],
    ]);
    expect(inv.refunds).toEqual([{ date: d('2026-09-15'), label: 'Refund of balance', amount: 50 }]);
    expect(inv).toMatchObject({ given_back: 50, total_charged: 1312.5, total_refunded: 50, total_paid: 1262.5 });
    // the customer's copy has no payout section
    expect(inv.payout).toBeUndefined();
  });

  it('lists the customizations picked at booking, as they were then, apart from the package', async () => {
    // $1,000 package + $200 add-on + $60 of customizations ($20 flat, $5 × 8 guests), less $100 promo
    const chosen_options = [
      { group_id: 'g1', title: 'Style', amount: 20, options: [{ option_id: 'o1', label: 'Knotless', price: 20, price_mode: 'FLAT', quantity: 1, amount: 20 }] },
      { group_id: 'g2', title: 'Extras', amount: 40, options: [{ option_id: 'o2', label: 'Beads', price: 5, price_mode: 'PER_UNIT', quantity: 8, amount: 40 }, { option_id: 'o3', label: 'Wash', price: 0, price_mode: 'FLAT', quantity: 1, amount: 0 }] },
    ];
    const inv = await setup(booking({ amount: 1160, chosen_options })).invoiceFor('x', { id: 'c1' });
    expect(inv.price_lines.slice(0, 5)).toEqual([
      { label: 'Package: Wedding Photography (8 hours coverage)', amount: 1000 },
      { label: 'Customization: Style: Knotless', amount: 20 },
      { label: 'Customization: Extras: Beads, Wash', amount: 40 },
      { label: 'Add-on: Album', amount: 200 },
      { label: 'Promo SPRING', amount: -100 },
    ]);
  });

  it("the vendor's copy adds their payout and Vendly's commission", async () => {
    const inv = await setup(booking()).invoiceFor('ckbooking12345678', { id: 'v1' });
    expect(inv.copy).toBe('vendor');
    // vendor part: 550 + 500 + 150 = 1200; commission at the booking's rate (125 / 1250 = 10%)
    expect(inv.payout).toEqual({ vendor_part: 1200, commission: 120, paid_out: 1080, held: 0 });
  });

  it('admins get the full copy; anyone else is refused', async () => {
    expect((await setup(booking()).invoiceFor('x', { id: 'a1', type: 'ADMIN' })).copy).toBe('admin');
    await expect(setup(booking()).invoiceFor('x', { id: 'someone' })).rejects.toThrow(ForbiddenException);
  });

  it('a legacy Checkout booking: one payment, refunds from transactions', async () => {
    const inv = await setup(booking({ status: 'CANCELLED', installments: [], extras: [], discount: 0, amount: 450, service_fee: 22.5, contracts: [] }), {
      refunds: [{ created_at: d('2026-09-01'), amount: 225 }],
    }).invoiceFor('x', { id: 'c1' });
    expect(inv.price_lines).toEqual([
      { label: 'Package: Wedding Photography', amount: 450 },
      { label: 'Vendly Protection fee', amount: 22.5 },
    ]);
    expect(inv.charges).toEqual([{ date: d('2026-08-02'), label: 'Payment', amount: 472.5, status: 'Paid' }]);
    expect(inv).toMatchObject({ total_charged: 472.5, total_refunded: 225, total_paid: 247.5 });
  });

  it('refuses a booking with nothing paid', async () => {
    await expect(setup(booking({ paid_at: null, installments: [] })).invoiceFor('x', { id: 'c1' })).rejects.toThrow(BadRequestException);
  });

  it('renders a real PDF', async () => {
    const { buffer, name } = await setup(booking()).pdfFor('x', { id: 'v1' });
    expect(name).toBe(`vendly-invoice-${invoiceNumber('ckbooking12345678')}.pdf`);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toContain('INV-12345678');
  });

  it('hands out a short-lived link that serves the same PDF without a login header', async () => {
    const service = setup(booking(), { user: { id: 'c1', type: 'CUSTOMER' } });
    const { data } = await service.linkFor('ckbooking12345678', { id: 'c1' });
    expect(data.url).toMatch(/^https:\/\/api\.test\/api\/invoices\/.+\..+$/);
    const token = data.url.split('/').pop()!;
    const file = await service.resolveLink(token);
    expect(file.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    await expect(service.resolveLink(`${token}x`)).rejects.toThrow(ForbiddenException);
  });

  it('stops serving a link once the account is deleted or suspended', async () => {
    for (const user of [{ id: 'c1', type: 'CUSTOMER', deleted_at: new Date(), status: 1 }, { id: 'c1', type: 'CUSTOMER', deleted_at: null, status: 0 }, null]) {
      const service = setup(booking(), { user: { id: 'c1', type: 'CUSTOMER', deleted_at: null, status: 1 } });
      const token = (await service.linkFor('ckbooking12345678', { id: 'c1' })).data.url.split('/').pop()!;
      const gone = setup(booking(), { user });
      await expect(gone.resolveLink(token)).rejects.toThrow('This download link has expired.');
    }
  });
});
