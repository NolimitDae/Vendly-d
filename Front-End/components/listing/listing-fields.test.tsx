import React, { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategoryCombobox from './CategoryCombobox';
import LocationField, { appendPlace, type PickedPlace } from './LocationField';
import { categoryRows } from '@/lib/categories';

jest.mock('@/service/geo/geo.service', () => ({ GeoService: { suggest: jest.fn(), reverse: jest.fn() } }));
import { GeoService } from '@/service/geo/geo.service';

const categories = [
  { id: 'music', name: 'Music & Entertainment', sub_categories: [{ id: 'dj', name: 'DJ' }, { id: 'band', name: 'Live Band' }] },
  { id: 'food', name: 'Catering & Food', sub_categories: [{ id: 'cake', name: 'Cakes & Desserts' }] },
];

beforeEach(() => jest.clearAllMocks());

describe('categoryRows', () => {
  it('finds a sub-category by name and shows its category', () => {
    expect(categoryRows(categories, 'dj')).toEqual([
      expect.objectContaining({ categoryId: 'music', subId: null, title: 'Music & Entertainment' }),
      expect.objectContaining({ categoryId: 'music', subId: 'dj', title: 'DJ', subtitle: 'Music & Entertainment' }),
    ]);
  });

  it('a matching category lists all of its own', () => {
    expect(categoryRows(categories, 'catering').map((r) => r.title)).toEqual(['Catering & Food', 'Cakes & Desserts']);
  });

  it('nothing for no match', () => {
    expect(categoryRows(categories, 'zzz')).toEqual([]);
  });
});

function CategoryHarness({ onSubmit = jest.fn() }: { onSubmit?: () => void }) {
  const [c, setC] = useState('');
  const [s, setS] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <CategoryCombobox categories={categories} categoryId={c} subCategoryId={s} onChange={(a, b) => { setC(a); setS(b); }} />
    </form>
  );
}

describe('CategoryCombobox', () => {
  it('searches and picks a sub-category', async () => {
    render(<CategoryHarness />);
    const box = screen.getByRole('combobox', { name: 'Category' });
    await userEvent.click(box);
    await userEvent.type(box, 'cake');
    await userEvent.click(screen.getByRole('option', { name: /Cakes & Desserts/ }));
    expect(box).toHaveValue('Catering & Food › Cakes & Desserts');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Enter picks the highlighted option without submitting the form', async () => {
    const onSubmit = jest.fn();
    render(<CategoryHarness onSubmit={onSubmit} />);
    const box = screen.getByRole('combobox', { name: 'Category' });
    await userEvent.click(box);
    await userEvent.type(box, 'dj{ArrowDown}{Enter}');
    expect(box).toHaveValue('Music & Entertainment › DJ');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('can be cleared', async () => {
    render(<CategoryHarness />);
    const box = screen.getByRole('combobox', { name: 'Category' });
    await userEvent.click(box);
    await userEvent.click(screen.getByRole('option', { name: /Live Band/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear category' }));
    expect(box).toHaveValue('');
  });
});

function LocationHarness({ spy }: { spy: (p: PickedPlace, r: number | null) => void }) {
  const [place, setPlace] = useState<PickedPlace>({ label: '' });
  const [radius, setRadius] = useState<number | null>(null);
  spy(place, radius);
  return <LocationField value={place} onChange={setPlace} radius={radius} onRadiusChange={setRadius} />;
}

describe('LocationField', () => {
  it('suggests places as you type and keeps the picked position', async () => {
    (GeoService.suggest as jest.Mock).mockResolvedValue({ data: { data: [{ label: 'Brooklyn, New York, NY', lat: 40.65, lng: -73.95 }] } });
    const spy = jest.fn();
    render(<LocationHarness spy={spy} />);
    await userEvent.type(screen.getByRole('combobox', { name: 'Package location' }), 'Brook');
    await userEvent.click(await screen.findByRole('option', { name: 'Brooklyn, New York, NY' }));
    expect(spy).toHaveBeenLastCalledWith({ label: 'Brooklyn, New York, NY', lat: 40.65, lng: -73.95 }, null);
    // debounced: one lookup for the whole word, not one per letter
    expect(GeoService.suggest).toHaveBeenCalledTimes(1);
    expect(GeoService.suggest).toHaveBeenCalledWith('Brook', null);
  });

  it("a lookup still running when a place is picked doesn't reopen the list", async () => {
    let answer: (v: any) => void = () => {};
    (GeoService.suggest as jest.Mock)
      .mockResolvedValueOnce({ data: { data: [{ label: 'Austin, Texas, TX', lat: 30.27, lng: -97.74 }] } })
      .mockImplementationOnce(() => new Promise((r) => { answer = r; }));
    render(<LocationHarness spy={jest.fn()} />);
    const box = screen.getByRole('combobox', { name: 'Package location' });
    await userEvent.type(box, 'Aus');
    const option = await screen.findByRole('option', { name: 'Austin, Texas, TX' });
    await userEvent.type(box, 't');
    await new Promise((r) => setTimeout(r, 350)); // the second lookup starts
    await userEvent.click(option.isConnected ? option : await screen.findByRole('option', { name: 'Austin, Texas, TX' }));
    await act(async () => answer({ data: { data: [{ label: 'Austin, Texas, TX', lat: 30.27, lng: -97.74 }] } }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('typing again forgets the old position', async () => {
    (GeoService.suggest as jest.Mock).mockResolvedValue({ data: { data: [{ label: 'Austin, Texas, TX', lat: 30.27, lng: -97.74 }] } });
    const spy = jest.fn();
    render(<LocationHarness spy={spy} />);
    const box = screen.getByRole('combobox', { name: 'Package location' });
    await userEvent.type(box, 'Aus');
    await userEvent.click(await screen.findByRole('option', { name: 'Austin, Texas, TX' }));
    await userEvent.type(box, 'x');
    expect(spy).toHaveBeenLastCalledWith({ label: 'Austin, Texas, TXx' }, null);
  });

  it('uses the browser position and names it', async () => {
    const getCurrentPosition = jest.fn((ok) => ok({ coords: { latitude: 41.88, longitude: -87.63 } }));
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    (GeoService.reverse as jest.Mock).mockResolvedValue({ data: { data: { label: 'Chicago, Illinois, IL', lat: 41.88, lng: -87.63 } } });
    const spy = jest.fn();
    render(<LocationHarness spy={spy} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use my current location' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Package location' })).toHaveValue('Chicago, Illinois, IL'));
    expect(GeoService.reverse).toHaveBeenCalledWith(41.88, -87.63);
  });

  it('explains a blocked location', async () => {
    const getCurrentPosition = jest.fn((_ok, fail) => fail({ code: 1 }));
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    render(<LocationHarness spy={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use my current location' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Location is blocked');
  });

  it('picks a service radius', async () => {
    const spy = jest.fn();
    render(<LocationHarness spy={spy} />);
    await userEvent.click(screen.getByRole('button', { name: '25 mi' }));
    expect(screen.getByRole('button', { name: '25 mi' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/within 25 miles/)).toBeInTheDocument();
    expect(spy).toHaveBeenLastCalledWith({ label: '' }, 25);
  });
});

describe('appendPlace', () => {
  const entries = (fd: FormData) => Object.fromEntries(Array.from(fd.entries()));

  it('sends the position only with a location', () => {
    const fd = new FormData();
    appendPlace(fd, { label: ' Austin, Texas, TX ', lat: 30.27, lng: -97.74 }, 50, false);
    expect(entries(fd)).toEqual({ location: 'Austin, Texas, TX', lat: '30.27', lng: '-97.74', service_radius_miles: '50' });
  });

  it('a typed place sends no position', () => {
    const fd = new FormData();
    appendPlace(fd, { label: 'Austin' }, 0, false);
    expect(entries(fd)).toEqual({ location: 'Austin', service_radius_miles: '0' });
  });

  it('editing sends an empty location to clear it; a new package sends nothing', () => {
    const edit = new FormData();
    appendPlace(edit, { label: '' }, null, true);
    expect(entries(edit)).toEqual({ location: '' });
    const create = new FormData();
    appendPlace(create, { label: '' }, null, false);
    expect(entries(create)).toEqual({});
  });
});
