import { PaymentPlan } from 'prisma/generated/enums';
import { buildSchedule } from 'src/modules/payments/payment-schedule';
import { buildPricingSchedule } from 'src/modules/contracts/contract-merge';
import { formatOptionGroups, PackageOptionsService } from './package-options.service';
import {
  chosenGroupText,
  cleanOptionGroups,
  NO_LONGER_OFFERED,
  OfferedGroup,
  optionPriceText,
  optionScheduleLines,
  priceOptionChoices,
  readChosenOptions,
} from './package-options';
import { priceForPackage, PricingError } from './pricing';

/** A braider's package: "Style" (pick one, required) and "Extras" (pick up to 2). */
const offered = (): OfferedGroup[] => [
  {
    id: 'g-style',
    title: 'Style',
    required: true,
    max_select: 1,
    options: [
      { id: 'o-knotless', label: 'Knotless', price: 20, price_mode: 'FLAT' },
      { id: 'o-miracle', label: 'Miracle knots', price: 35, price_mode: 'FLAT' },
      { id: 'o-box', label: 'Box braids', price: 0, price_mode: 'FLAT' },
    ],
  },
  {
    id: 'g-extras',
    title: 'Extras',
    required: false,
    max_select: 2,
    options: [
      { id: 'o-beads', label: 'Beads', price: 5, price_mode: 'PER_UNIT' },
      { id: 'o-curls', label: 'Curled ends', price: 10, price_mode: 'FLAT' },
      { id: 'o-wash', label: 'Wash', price: 15, price_mode: 'FLAT' },
    ],
  },
];

const fixed = { unit: 'fixed' as const, quantity: 1 };
const perPerson = (n: number) => ({ unit: 'person' as const, quantity: n });

describe('package customizations: the vendor form', () => {
  const group = (over: Record<string, unknown> = {}) => ({ title: 'Style', options: [{ label: 'Knotless', price: 20 }, { label: 'Miracle knots' }], ...over });

  it('tidies titles and labels, defaults to pick one, flat and no upcharge', () => {
    const [g] = cleanOptionGroups([group({ title: '  Style  ', options: [{ label: ' Knotless ', price: '20.005' }, { label: 'Box', price: null }] })]);
    expect(g).toEqual({
      id: null,
      title: 'Style',
      required: false,
      max_select: 1,
      options: [
        { id: null, label: 'Knotless', price: 20.01, price_mode: 'FLAT' },
        { id: null, label: 'Box', price: 0, price_mode: 'FLAT' },
      ],
    });
  });

  it('keeps ids so existing customizations are updated in place', () => {
    const [g] = cleanOptionGroups([group({ id: 'g1', options: [{ id: 'o1', label: 'Knotless', price_mode: 'PER_UNIT' }] })]);
    expect(g.id).toBe('g1');
    expect(g.options[0]).toMatchObject({ id: 'o1', price_mode: 'PER_UNIT' });
  });

  it('needs a title and at least one option, each named', () => {
    expect(() => cleanOptionGroups([group({ title: ' ' })])).toThrow('Give customization 1 a title');
    expect(() => cleanOptionGroups([group({ options: [] })])).toThrow('Add at least one option to “Style”');
    expect(() => cleanOptionGroups([group({ options: [{ label: '' }] })])).toThrow('Option 1 of “Style” needs a name');
  });

  it('refuses duplicate titles and duplicate options', () => {
    expect(() => cleanOptionGroups([group(), group({ title: 'style' })])).toThrow('Give each one its own title');
    expect(() => cleanOptionGroups([group({ options: [{ label: 'Knotless' }, { label: 'knotless' }] })])).toThrow('“Style” has “knotless” twice');
  });

  it('“pick up to N” needs at least N options', () => {
    expect(cleanOptionGroups([group({ max_select: 2 })])[0].max_select).toBe(2);
    expect(() => cleanOptionGroups([group({ max_select: 3 })])).toThrow('lets customers pick up to 3, but it only has 2 options');
  });

  it('keeps to the limits: 10 customizations, 30 options, label lengths, upcharge range', () => {
    expect(() => cleanOptionGroups(Array.from({ length: 11 }, (_, i) => group({ title: `T${i}` })))).toThrow('up to 10 customizations');
    expect(() => cleanOptionGroups([group({ options: Array.from({ length: 31 }, (_, i) => ({ label: `O${i}` })) })])).toThrow('up to 30 options');
    expect(() => cleanOptionGroups([group({ title: 'x'.repeat(61) })])).toThrow('60 characters');
    expect(() => cleanOptionGroups([group({ options: [{ label: 'y'.repeat(81) }] })])).toThrow('80 characters');
    expect(() => cleanOptionGroups([group({ options: [{ label: 'Gold', price: -1 }] })])).toThrow('between $0 and $100,000');
  });

  it('shows each upcharge the way customers read it', () => {
    expect(optionPriceText(20, 'FLAT', 'person')).toBe('+$20.00');
    expect(optionPriceText(5, 'PER_UNIT', 'person')).toBe('+$5.00 / person');
    expect(optionPriceText(15, 'PER_UNIT', 'hour')).toBe('+$15.00 / hour');
    // a flat priced package counts a per unit upcharge once
    expect(optionPriceText(5, 'PER_UNIT', 'fixed')).toBe('+$5.00');
    expect(optionPriceText(0, 'FLAT', 'fixed')).toBe('');
  });

  it('formats a package’s customizations for the apps', () => {
    const rows: any = [{ id: 'g', title: 'Style', required: true, max_select: 3, options: [{ id: 'o', label: 'Knotless', price: { toString: () => '5' }, price_mode: 'PER_UNIT' }] }];
    expect(formatOptionGroups(rows, 'person')).toEqual([
      { id: 'g', title: 'Style', required: true, max_select: 3, selection_text: 'Pick up to 3', options: [{ id: 'o', label: 'Knotless', price: 5, price_mode: 'PER_UNIT', price_text: '+$5.00 / person' }] },
    ]);
  });
});

describe('package customizations: the customer’s choices', () => {
  it('prices a pick one choice and an optional pick up to N', () => {
    const res = priceOptionChoices(offered(), [{ group_id: 'g-style', option_ids: ['o-knotless'] }, { group_id: 'g-extras', option_ids: ['o-curls', 'o-wash'] }], fixed);
    expect(res.amount).toBe(45);
    expect(res.groups.map(chosenGroupText)).toEqual(['Style: Knotless', 'Extras: Curled ends, Wash']);
  });

  it('a required customization must be answered; optional ones may be skipped', () => {
    expect(() => priceOptionChoices(offered(), [], fixed)).toThrow('Choose an option for “Style”');
    expect(() => priceOptionChoices(offered(), [{ group_id: 'g-style', option_ids: [] }], fixed)).toThrow(PricingError);
    const res = priceOptionChoices(offered(), [{ group_id: 'g-style', option_ids: ['o-box'] }], fixed);
    expect(res.groups).toHaveLength(1);
    expect(res.amount).toBe(0);
  });

  it('pick one takes one; pick up to N takes no more than N', () => {
    expect(() => priceOptionChoices(offered(), [{ group_id: 'g-style', option_ids: ['o-knotless', 'o-miracle'] }], fixed)).toThrow('Pick just one option for “Style”');
    expect(() =>
      priceOptionChoices(offered(), [{ group_id: 'g-style', option_ids: ['o-box'] }, { group_id: 'g-extras', option_ids: ['o-beads', 'o-curls', 'o-wash'] }], fixed),
    ).toThrow('You can pick up to 2 options for “Extras”');
    // the same option twice counts once
    expect(priceOptionChoices(offered(), [{ group_id: 'g-style', option_ids: ['o-miracle', 'o-miracle'] }], fixed).amount).toBe(35);
  });

  it('refuses ids that aren’t the package’s own, and a customization answered twice', () => {
    expect(() => priceOptionChoices(offered(), [{ group_id: 'g-other', option_ids: ['o-knotless'] }], fixed)).toThrow(NO_LONGER_OFFERED);
    expect(() => priceOptionChoices(offered(), [{ group_id: 'g-style', option_ids: ['o-beads'] }], fixed)).toThrow(NO_LONGER_OFFERED);
    expect(() =>
      priceOptionChoices(offered(), [{ group_id: 'g-style', option_ids: ['o-box'] }, { group_id: 'g-style', option_ids: ['o-knotless'] }], fixed),
    ).toThrow('answered once');
  });

  it('lists the choices in the vendor’s order, whatever order they were sent in', () => {
    const res = priceOptionChoices(offered(), [{ group_id: 'g-extras', option_ids: ['o-wash', 'o-curls'] }, { group_id: 'g-style', option_ids: ['o-box'] }], fixed);
    expect(res.groups.map((g) => g.group_id)).toEqual(['g-style', 'g-extras']);
    expect(res.groups[1].options.map((o) => o.label)).toEqual(['Curled ends', 'Wash']);
  });
});

describe('package customizations: upcharge math', () => {
  const choose = (extras: string[]) => [{ group_id: 'g-style', option_ids: ['o-knotless'] }, { group_id: 'g-extras', option_ids: extras }];

  it('flat upcharges are added once; per unit ones are multiplied by the package quantity', () => {
    const res = priceOptionChoices(offered(), choose(['o-beads', 'o-curls']), perPerson(12));
    const beads = res.groups[1].options[0];
    expect(beads).toMatchObject({ price: 5, quantity: 12, amount: 60, price_text: '+$60.00 ($5.00 × 12 guests)' });
    expect(res.groups[1].options[1]).toMatchObject({ quantity: 1, amount: 10, price_text: '+$10.00' });
    // 20 (style) + 60 (beads × 12) + 10 (curls)
    expect(res.amount).toBe(90);
  });

  it('counts hourly and daily packages the same way the package price does', () => {
    const start = '2026-12-05T18:00:00.000Z';
    const line = priceForPackage({ price: 100, price_unit: 'hour', min_quantity: 3 }, { event_start_at: start, event_end_at: '2026-12-05T20:00:00.000Z' });
    const res = priceOptionChoices(offered(), choose(['o-beads']), { unit: line.unit, quantity: line.quantity });
    // the 3 hour minimum is billed, so per unit upcharges count 3 hours too
    expect(res.groups[1].options[0]).toMatchObject({ quantity: 3, amount: 15, price_text: '+$15.00 ($5.00 × 3 hours)' });
  });

  it('asks for the missing count instead of counting a per unit upcharge once (quote bookings)', () => {
    const missing = { unit: 'person' as const, quantity: null, missing: 'Enter how many guests are coming.' };
    expect(() => priceOptionChoices(offered(), choose(['o-beads']), missing)).toThrow('Enter how many guests are coming.');
    // flat choices don't need it
    expect(priceOptionChoices(offered(), choose(['o-curls']), missing).amount).toBe(30);
  });

  it('a per unit upcharge on a flat priced package is counted once', () => {
    expect(priceOptionChoices(offered(), choose(['o-beads']), fixed).groups[1].options[0]).toMatchObject({ quantity: 1, amount: 5, price_text: '+$5.00' });
  });

  it('the upcharges are part of every payment plan: full, 50% and 25% deposits', () => {
    const pkg = priceForPackage({ price: 45, price_unit: 'person' }, { guest_count: 12 });
    const options = priceOptionChoices(offered(), choose(['o-beads']), { unit: pkg.unit, quantity: pkg.quantity });
    const price = pkg.amount + options.amount; // 540 + 20 + 60
    expect(price).toBe(620);
    const eventStart = new Date(Date.now() + 60 * 86400e3);
    const fee = 31;
    const total = (plan: PaymentPlan) => buildSchedule({ plan, price, serviceFee: fee, eventStart }).reduce((s, i) => s + i.amount, 0);
    for (const plan of [PaymentPlan.FULL_ON_ACCEPT, PaymentPlan.DEPOSIT_50, PaymentPlan.DEPOSIT_25, PaymentPlan.PAY_AFTER_SERVICE]) {
      expect(Math.round(total(plan) * 100) / 100).toBe(651);
    }
    const [deposit, balance] = buildSchedule({ plan: PaymentPlan.DEPOSIT_50, price, serviceFee: fee, eventStart });
    // half of the price with the upcharges, plus the whole fee up front
    expect(deposit).toMatchObject({ amount: 341, fee_amount: 31 });
    expect(balance.amount).toBe(310);
    const [deposit25] = buildSchedule({ plan: PaymentPlan.DEPOSIT_25, price, serviceFee: fee, eventStart });
    expect(deposit25.amount).toBe(186);
  });

  it('Schedule A lists every choice, with its upcharge when there is one', () => {
    const res = priceOptionChoices(offered(), [{ group_id: 'g-style', option_ids: ['o-box'] }, { group_id: 'g-extras', option_ids: ['o-beads', 'o-curls'] }], perPerson(4));
    const lines = optionScheduleLines(res.groups);
    expect(lines).toEqual([
      { label: 'Style: Box braids', amount: 0 },
      { label: 'Extras: Beads, Curled ends (Beads +$20.00 ($5.00 × 4 guests); Curled ends +$10.00)', amount: 30 },
    ]);
    const schedule = buildPricingSchedule({ packageLabel: null, packageAmount: 200, addOns: [], options: lines, discount: 0, vendorPrice: 230, fees: [], customerRoleLabel: 'Customer' });
    expect(schedule).toContain('- Customization: Style: Box braids\n');
    expect(schedule).toContain('- Customization: Extras: Beads, Curled ends (Beads +$20.00 ($5.00 × 4 guests); Curled ends +$10.00) = $30.00');
    expect(schedule).toContain('- Vendor price: $230.00');
  });
});

describe('package customizations: the booking keeps its own copy', () => {
  it('the snapshot carries titles, labels and prices, and a later package edit doesn’t change it', () => {
    const groups = offered();
    const snap = priceOptionChoices(groups, [{ group_id: 'g-style', option_ids: ['o-miracle'] }], fixed);
    const stored = JSON.parse(JSON.stringify(snap.groups));
    // the vendor renames the option and raises its price afterwards
    groups[0].title = 'Braid style';
    groups[0].options[1].label = 'Miracle knots (new)';
    groups[0].options[1].price = 50;
    expect(readChosenOptions(stored)).toEqual([
      {
        group_id: 'g-style',
        title: 'Style',
        amount: 35,
        options: [{ option_id: 'o-miracle', label: 'Miracle knots', price: 35, price_mode: 'FLAT', quantity: 1, amount: 35, price_text: '+$35.00' }],
      },
    ]);
  });

  it('reads older bookings (no snapshot) as no choices', () => {
    expect(readChosenOptions(null)).toEqual([]);
    expect(readChosenOptions({ nope: true })).toEqual([]);
  });

  it('prices against the package as it is now and turns a bad choice into a 400', async () => {
    const prisma: any = { listingOptionGroup: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new PackageOptionsService(prisma);
    await expect(service.priceChoices('l1', [{ group_id: 'g-style', option_ids: ['o-box'] }], fixed)).rejects.toMatchObject({ status: 400, message: NO_LONGER_OFFERED });
    await expect(service.priceChoices('l1', undefined, fixed)).resolves.toEqual({ groups: [], amount: 0 });
  });
});

describe('package customizations: saving the vendor’s list', () => {
  const setup = (existing: any[]) => {
    const tx: any = {
      listingOptionGroup: {
        findMany: jest.fn().mockResolvedValue(existing),
        update: jest.fn(async ({ where }: any) => ({ id: where.id })),
        create: jest.fn(async () => ({ id: 'g-new' })),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      listingOption: {
        update: jest.fn(async ({ where }: any) => ({ id: where.id })),
        create: jest.fn(async ({ data }: any) => ({ id: `o-new-${data.sort}` })),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma: any = {
      vendorListing: { findFirst: jest.fn().mockResolvedValue({ id: 'l1', vendor_id: 'v1', price_unit: 'person' }) },
      listingOptionGroup: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: (fn: any) => fn(tx),
    };
    return { service: new PackageOptionsService(prisma), tx };
  };

  it('updates the ones it keeps, creates new ones and removes the rest', async () => {
    const { service, tx } = setup([{ id: 'g1', options: [{ id: 'o1' }, { id: 'o2' }] }, { id: 'g2', options: [] }]);
    await service.setForListing('v1', 'l1', [
      { id: 'g1', title: 'Style', max_select: 1, options: [{ id: 'o1', label: 'Knotless', price: 20 }, { id: 'o-stranger', label: 'Twists' }] },
      { title: 'Length', required: true, options: [{ label: 'Waist' }] },
    ]);
    expect(tx.listingOptionGroup.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'g1' }, data: { title: 'Style', required: false, max_select: 1, sort: 0 } }));
    expect(tx.listingOptionGroup.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: 'Length', required: true, sort: 1, listing_id: 'l1' }) }));
    expect(tx.listingOption.update).toHaveBeenCalledTimes(1);
    // an id from somewhere else is never moved into this package: a new option is made instead
    expect(tx.listingOption.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ label: 'Twists', group_id: 'g1' }) }));
    expect(tx.listingOption.deleteMany).toHaveBeenCalledWith({ where: { group_id: 'g1', id: { notIn: ['o1', 'o-new-1'] } } });
    expect(tx.listingOptionGroup.deleteMany).toHaveBeenCalledWith({ where: { listing_id: 'l1', id: { notIn: ['g1', 'g-new'] } } });
  });

  it('refuses another vendor’s package and an invalid list', async () => {
    const { service } = setup([]);
    await expect(service.setForListing('v2', 'l1', [])).rejects.toMatchObject({ status: 403 });
    await expect(service.setForListing('v1', 'l1', [{ title: 'Style', max_select: 4, options: [{ label: 'A' }] }])).rejects.toMatchObject({ status: 400 });
  });
});
