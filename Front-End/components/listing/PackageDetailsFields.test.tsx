import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PackageDetailsFields, {
  appendPackageDetails,
  emptyPackageDetails,
  packageDetailsError,
  packageDetailsFrom,
  type PackageDetails,
} from './PackageDetailsFields';
import { noticeLine } from '@/lib/package-details';

const sent = (d: PackageDetails, clear: boolean) => {
  const fd = new FormData();
  appendPackageDetails(fd, d, clear);
  return Object.fromEntries(fd.entries());
};

describe('package details form', () => {
  it('sends trimmed items and the notice in hours', () => {
    expect(sent({ items: [' 8 hours ', '', 'Gallery'], notice: '3', noticeUnit: 'days' }, false)).toEqual({
      included_items: JSON.stringify(['8 hours', 'Gallery']),
      min_notice_hours: '72',
    });
    expect(sent({ items: [], notice: '12', noticeUnit: 'hours' }, false)).toEqual({ min_notice_hours: '12' });
  });

  it('sends nothing for a new package without details, and clears them on edit', () => {
    expect(sent(emptyPackageDetails(), false)).toEqual({});
    expect(sent(emptyPackageDetails(), true)).toEqual({ included_items: '[]', min_notice_hours: '' });
  });

  it('shows saved whole days as days', () => {
    expect(packageDetailsFrom({ included_items: ['a'], min_notice_hours: 48 })).toEqual({ items: ['a'], notice: '2', noticeUnit: 'days' });
    expect(packageDetailsFrom({ min_notice_hours: 36 })).toEqual({ items: [], notice: '36', noticeUnit: 'hours' });
    expect(packageDetailsFrom({ included_items: null, min_notice_hours: null })).toEqual(emptyPackageDetails());
  });

  it('checks the limits', () => {
    expect(packageDetailsError({ items: Array(21).fill('x'), notice: '', noticeUnit: 'days' })).toBe('Add up to 20 included items.');
    expect(packageDetailsError({ items: ['x'.repeat(121)], notice: '', noticeUnit: 'days' })).toMatch(/up to 120 characters/);
    expect(packageDetailsError({ items: [], notice: '91', noticeUnit: 'days' })).toBe('Minimum notice can be up to 90 days.');
    expect(packageDetailsError({ items: [], notice: '1.5', noticeUnit: 'hours' })).toBe('Minimum notice must be a whole number.');
    expect(packageDetailsError({ items: ['ok'], notice: '90', noticeUnit: 'days' })).toBeNull();
  });

  it('adds and removes items', async () => {
    function Harness() {
      const [d, setD] = useState<PackageDetails>({ items: ['Lights'], notice: '', noticeUnit: 'days' });
      return (
        <>
          <PackageDetailsFields value={d} onChange={setD} />
          <output>{JSON.stringify(d.items)}</output>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: /add an item/i }));
    await user.type(screen.getByLabelText('Included item 2'), 'Sound');
    expect(screen.getByRole('status')).toHaveTextContent('["Lights","Sound"]');
    await user.click(screen.getByRole('button', { name: 'Remove included item 1' }));
    expect(screen.getByRole('status')).toHaveTextContent('["Sound"]');
  });

  it('words the notice for the package page', () => {
    expect(noticeLine(48)).toBe('Book at least 2 days ahead');
    expect(noticeLine(5)).toBe('Book at least 5 hours ahead');
    expect(noticeLine(null)).toBeNull();
  });
});
