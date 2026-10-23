import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlanPage from './page';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

jest.mock('@/service/planning/planning.service', () => ({
  PlanningService: { checklist: jest.fn(), eventPlan: jest.fn() },
}));

jest.mock('@/service/geo/geo.service', () => ({
  GeoService: { suggest: jest.fn().mockResolvedValue({ data: { data: [] } }), reverse: jest.fn() },
}));

import { PlanningService } from '@/service/planning/planning.service';

const item = (over: Record<string, any> = {}) => ({
  category: { id: 'venue', name: 'Venues' },
  priority: 'ESSENTIAL',
  why: 'Most couples book the venue first.',
  tip: 'Look for a space that comfortably holds 120 guests.',
  lead_days: 300,
  book_by: '2027-01-15',
  book_soon: false,
  share_percent: 30,
  suggested_budget: 7500,
  available_vendors: 4,
  search: { category_id: 'venue', date: '2027-11-11', near_lat: 29.76, near_lng: -95.37, radius_miles: 25, location: 'Houston, TX' },
  ...over,
});

const plan = (items: any[]) => ({
  data: {
    success: true,
    data: {
      event_type: 'WEDDING',
      guest_count: 120,
      budget: 25000,
      date: '2027-11-11',
      near: { lat: 29.76, lng: -95.37, label: 'Houston, TX' },
      location: 'Houston, TX',
      radius_miles: 25,
      items,
      totals: { suggested_budget: items.reduce((s, i) => s + (i.suggested_budget ?? 0), 0) },
    },
  },
});

describe('Plan your event page', () => {
  it('has a labelled form', () => {
    render(<PlanPage />);
    expect(screen.getByRole('heading', { name: 'Plan your event' })).toBeInTheDocument();
    expect(screen.getByLabelText('Event type')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Date/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Guests/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Total budget/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Where/)).toBeInTheDocument();
  });

  it('sends the form and shows results grouped by priority with budget, book-by and a marketplace link', async () => {
    (PlanningService.checklist as jest.Mock).mockResolvedValue(
      plan([
        item(),
        item({ category: { id: 'photo', name: 'Photography & Video' }, priority: 'ESSENTIAL', book_soon: true, book_by: '2026-10-01', lead_days: 270, suggested_budget: 3000, share_percent: 12, available_vendors: 1, search: { ...item().search, category_id: 'photo' } }),
        item({ category: { id: 'decor', name: 'Decor & Florals' }, priority: 'NICE_TO_HAVE', tip: null, suggested_budget: 2000, share_percent: 8, available_vendors: 0, search: { ...item().search, category_id: 'decor' } }),
      ]),
    );
    const user = userEvent.setup();
    render(<PlanPage />);

    await user.selectOptions(screen.getByLabelText('Event type'), 'WEDDING');
    await user.type(screen.getByLabelText(/^Guests/), '120');
    await user.type(screen.getByLabelText(/^Total budget/), '25000');
    await user.click(screen.getByRole('button', { name: /get my checklist/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: '3 services for your wedding' })).toBeInTheDocument());
    expect(PlanningService.checklist).toHaveBeenCalledWith({ event_type: 'WEDDING', guest_count: 120, budget: 25000 });

    const essential = screen.getByRole('region', { name: /Essential \(2\)/ });
    expect(within(essential).getByText('Venues')).toBeInTheDocument();
    expect(within(essential).getByText('$7,500')).toBeInTheDocument();
    expect(within(essential).getByText('Book by Jan 15, 2027')).toBeInTheDocument();
    expect(within(essential).getByText(/Book soon/)).toBeInTheDocument();
    expect(within(essential).getByText('4 vendors available that day nearby')).toBeInTheDocument();
    expect(within(essential).getByText('1 vendor available that day nearby')).toBeInTheDocument();

    const find = screen.getByRole('link', { name: 'Find vendors: Venues' });
    const href = new URL(find.getAttribute('href')!, 'http://x');
    expect(href.pathname).toBe('/marketplace');
    expect(Object.fromEntries(href.searchParams)).toEqual({
      category_id: 'venue',
      date: '2027-11-11',
      near_lat: '29.76',
      near_lng: '-95.37',
      radius_miles: '25',
      near: 'Houston, TX',
    });

    // no vendors free: browse the whole category instead
    const nice = screen.getByRole('region', { name: /Nice to have/ });
    expect(within(nice).getByText('No vendors available that day nearby')).toBeInTheDocument();
    expect(within(nice).getByRole('link', { name: 'Browse all: Decor & Florals' })).toHaveAttribute('href', '/marketplace?category_id=decor');
  });

  it('shows the empty state and the no-vendors note', async () => {
    (PlanningService.checklist as jest.Mock).mockResolvedValueOnce(plan([]));
    const user = userEvent.setup();
    render(<PlanPage />);
    await user.click(screen.getByRole('button', { name: /get my checklist/i }));
    await waitFor(() => expect(screen.getByText('No suggestions for this event yet')).toBeInTheDocument());

    (PlanningService.checklist as jest.Mock).mockResolvedValueOnce(plan([item({ available_vendors: 0 })]));
    await user.click(screen.getByRole('button', { name: /update my checklist/i }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/No vendors are listed for these services on that date near there yet/));
  });

  it('shows an error when the request fails', async () => {
    (PlanningService.checklist as jest.Mock).mockRejectedValueOnce({ response: { data: { message: ['guest_count must not be greater than 100000'] } } });
    const user = userEvent.setup();
    render(<PlanPage />);
    await user.click(screen.getByRole('button', { name: /get my checklist/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('guest_count must not be greater than 100000'));
  });
});
