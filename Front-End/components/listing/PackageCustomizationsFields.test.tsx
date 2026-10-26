import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PackageCustomizationsFields, { emptyCustomizations, saveCustomizations, type PackageCustomizationsValue } from './PackageCustomizationsFields';
import DosDontsFields from './DosDontsFields';
import DosDontsList from './DosDontsList';
import {
  appendDosDonts,
  choicesPayload,
  customizationsError,
  draftsFrom,
  draftsToInput,
  dosDontsError,
  emptyDosDonts,
  missingChoice,
  newCustomization,
  optionPriceText,
  togglePick,
  type Customization,
  type DosDonts,
} from '@/lib/package-options';

jest.mock('@/service/vendor/vendor-listing.service', () => ({ VendorListingService: { setCustomizations: jest.fn().mockResolvedValue({ data: { success: true } }) } }));
import { VendorListingService } from '@/service/vendor/vendor-listing.service';

let latest: PackageCustomizationsValue = emptyCustomizations();
function Editor({ unit = 'person', start = emptyCustomizations() }: { unit?: string; start?: PackageCustomizationsValue }) {
  const [v, setV] = useState(start);
  latest = v;
  return <PackageCustomizationsFields value={v} onChange={setV} priceUnit={unit} />;
}

describe('package customizations form', () => {
  beforeEach(() => jest.clearAllMocks());

  it('adds a customization with a title, options, upcharges and “pick up to N”', async () => {
    const user = userEvent.setup();
    render(<Editor />);
    await user.click(screen.getByRole('button', { name: /add customization/i }));
    await user.type(screen.getByLabelText('Title of customization 1'), 'Style');
    await user.type(screen.getByLabelText('Option 1 of Style'), 'Knotless');
    await user.type(screen.getByLabelText('Upcharge for option 1 of Style'), '20');
    await user.type(screen.getByLabelText('Option 2 of Style'), 'Beads');
    await user.type(screen.getByLabelText('Upcharge for option 2 of Style'), '5');
    await user.selectOptions(screen.getByLabelText('How the upcharge for option 2 of Style is counted'), 'PER_UNIT');
    await user.click(screen.getByRole('button', { name: /add an option/i }));
    await user.type(screen.getByLabelText('Option 3 of Style'), 'Wash');
    await user.selectOptions(screen.getByLabelText('How customers choose for Style'), 'multi');
    await user.click(screen.getByRole('checkbox', { name: /required/i }));

    expect(customizationsError(latest.drafts)).toBeNull();
    expect(draftsToInput(latest.drafts, true)).toEqual([
      {
        title: 'Style',
        required: true,
        max_select: 2,
        options: [
          { label: 'Knotless', price: 20, price_mode: 'FLAT' },
          { label: 'Beads', price: 5, price_mode: 'PER_UNIT' },
          { label: 'Wash', price: 0, price_mode: 'FLAT' },
        ],
      },
    ]);
  });

  it('reorders and removes customizations and options', async () => {
    const user = userEvent.setup();
    const start = { loaded: true, drafts: draftsFrom([
      { id: 'g1', title: 'Style', required: false, max_select: 1, options: [{ id: 'a', label: 'A', price: 0, price_mode: 'FLAT', price_text: '' }, { id: 'b', label: 'B', price: 0, price_mode: 'FLAT', price_text: '' }] },
      { id: 'g2', title: 'Length', required: false, max_select: 1, options: [{ id: 'c', label: 'Waist', price: 0, price_mode: 'FLAT', price_text: '' }] },
    ]) };
    render(<Editor start={start} />);
    await user.click(screen.getByRole('button', { name: 'Move Length up' }));
    expect(latest.drafts.map((g) => g.title)).toEqual(['Length', 'Style']);
    await user.click(screen.getByRole('button', { name: 'Move option 2 of Style up' }));
    expect(latest.drafts[1].options.map((o) => o.label)).toEqual(['B', 'A']);
    await user.click(screen.getByRole('button', { name: 'Remove option 1 of Style' }));
    await user.click(screen.getByRole('button', { name: 'Remove Length' }));
    expect(draftsToInput(latest.drafts, false)).toEqual([{ id: 'g1', title: 'Style', required: false, max_select: 1, options: [{ id: 'a', label: 'A', price: 0, price_mode: 'FLAT' }] }]);
  });

  it('offers per unit upcharges only on packages priced per person, hour or day', async () => {
    const user = userEvent.setup();
    render(<Editor unit="fixed" />);
    await user.click(screen.getByRole('button', { name: /add customization/i }));
    expect(screen.queryByLabelText(/how the upcharge/i)).not.toBeInTheDocument();
  });

  it('checks the setup like the server does', () => {
    const g = { ...newCustomization(), title: 'Style' };
    g.options[0].label = 'Knotless';
    g.options[1].label = 'Twists';
    expect(customizationsError([g])).toBeNull();
    expect(customizationsError([{ ...g, title: '' }])).toMatch(/Give customization 1 a title/);
    expect(customizationsError([g, { ...g }])).toMatch(/Give each one its own title/);
    expect(customizationsError([{ ...g, multi: true, max: '3' }])).toBe('“Style” lets customers pick up to 3, but it only has 2 options.');
    expect(customizationsError([{ ...g, options: [] }])).toBe('Add at least one option to “Style”.');
  });

  it('saves after the package: nothing for a new package without any, always on edit once loaded', async () => {
    await saveCustomizations('l1', emptyCustomizations(), 'fixed', false);
    await saveCustomizations('l1', emptyCustomizations(false), 'fixed', true);
    expect(VendorListingService.setCustomizations).not.toHaveBeenCalled();
    await saveCustomizations('l1', emptyCustomizations(), 'fixed', true);
    expect(VendorListingService.setCustomizations).toHaveBeenCalledWith('l1', []);
  });
});

describe('customer choices', () => {
  const groups: Customization[] = [
    { id: 's', title: 'Style', required: true, max_select: 1, options: [{ id: 'k', label: 'Knotless', price: 20, price_mode: 'FLAT', price_text: '+$20.00' }, { id: 'm', label: 'Miracle', price: 0, price_mode: 'FLAT', price_text: '' }] },
    { id: 'e', title: 'Extras', required: false, max_select: 2, options: ['a', 'b', 'c'].map((id) => ({ id, label: id, price: 0, price_mode: 'FLAT' as const, price_text: '' })) },
  ];

  it('pick one replaces, pick up to N stops at N', () => {
    let p = togglePick({}, groups[0], 'k');
    p = togglePick(p, groups[0], 'm');
    expect(p.s).toEqual(['m']);
    p = togglePick(togglePick(togglePick(p, groups[1], 'c'), groups[1], 'a'), groups[1], 'b');
    expect(p.e).toEqual(['c', 'a']);
    expect(choicesPayload(groups, p)).toEqual([{ group_id: 's', option_ids: ['m'] }, { group_id: 'e', option_ids: ['a', 'c'] }]);
  });

  it('asks for required ones', () => {
    expect(missingChoice(groups, {})).toBe('Choose an option for “Style”.');
    expect(missingChoice(groups, { s: ['k'] })).toBeNull();
  });

  it('reads upcharges like the server', () => {
    expect(optionPriceText(5, 'PER_UNIT', 'person')).toBe('+$5.00 / person');
    expect(optionPriceText(5, 'PER_UNIT', 'fixed')).toBe('+$5.00');
    expect(optionPriceText(0, 'FLAT', 'hour')).toBe('');
  });
});

describe('dos and don’ts', () => {
  const sent = (v: DosDonts, clear: boolean) => {
    const fd = new FormData();
    appendDosDonts(fd, v, clear);
    return Object.fromEntries(fd.entries());
  };

  it('sends trimmed lines; clears them on edit', () => {
    expect(sent({ dos: [' Wrap at night ', ''], donts: [] }, false)).toEqual({ dos: JSON.stringify(['Wrap at night']) });
    expect(sent(emptyDosDonts(), true)).toEqual({ dos: '[]', donts: '[]' });
    expect(dosDontsError({ dos: Array(16).fill('x'), donts: [] })).toBe('Add up to 15 dos.');
    expect(dosDontsError({ dos: [], donts: ['y'.repeat(201)] })).toBe('Each line can be up to 200 characters.');
  });

  it('vendors add lines; customers read them', async () => {
    const user = userEvent.setup();
    let v: DosDonts = emptyDosDonts();
    function Form() {
      const [s, set] = useState(emptyDosDonts());
      v = s;
      return <DosDontsFields value={s} onChange={set} />;
    }
    render(<Form />);
    await user.click(screen.getByRole('button', { name: /add a do$/i }));
    await user.type(screen.getByLabelText('Do 1'), 'Keep it dry');
    await user.click(screen.getByRole('button', { name: /add a don't/i }));
    await user.type(screen.getByLabelText("Don't 1"), 'Run it indoors');
    expect(v).toEqual({ dos: ['Keep it dry'], donts: ['Run it indoors'] });

    render(<DosDontsList dos={v.dos} donts={v.donts} />);
    expect(screen.getByRole('list', { name: 'Dos' })).toHaveTextContent('Keep it dry');
    expect(screen.getByRole('list', { name: "Don'ts" })).toHaveTextContent('Run it indoors');
  });
});
