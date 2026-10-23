import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SuggestedServicesCard from './SuggestedServicesCard';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));
jest.mock('@/service/planning/planning.service', () => ({
  PlanningService: { checklist: jest.fn(), eventPlan: jest.fn() },
}));
jest.mock('@/service/events/events.service', () => ({
  EventsService: { addBudgetItem: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { PlanningService } from '@/service/planning/planning.service';
import { EventsService } from '@/service/events/events.service';
import { toast } from 'react-toastify';

const search = (category_id: string) => ({ category_id, date: '2027-06-12', near_lat: null, near_lng: null, radius_miles: null, location: null });
const items = [
  { category: { id: 'venue', name: 'Venues' }, priority: 'ESSENTIAL', why: 'Venue first.', tip: null, lead_days: 300, book_by: '2026-08-16', book_soon: true, share_percent: 40, suggested_budget: 8000, available_vendors: 2, search: search('venue'), covered: true, covered_by: 'venue' },
  { category: { id: 'photo', name: 'Photography & Video' }, priority: 'ESSENTIAL', why: 'Most weddings book a photographer.', tip: 'One photographer usually covers up to 150 guests.', lead_days: 270, book_by: '2026-09-15', book_soon: true, share_percent: 30, suggested_budget: 6000, available_vendors: 3, search: search('photo'), covered: false, covered_by: null },
  { category: { id: 'decor', name: 'Decor & Florals' }, priority: 'RECOMMENDED', why: 'Flowers set the look.', tip: null, lead_days: 150, book_by: '2027-01-13', book_soon: false, share_percent: 30, suggested_budget: 6000, available_vendors: 0, search: search('decor'), covered: false, covered_by: null },
];
const response = (over: Record<string, any> = {}) => ({
  data: {
    success: true,
    data: {
      event_type: 'WEDDING', guest_count: 100, budget: 20000, date: '2027-06-12', near: null, location: null, radius_miles: 25,
      items, totals: { suggested_budget: 20000 },
      event: { id: 'e1', name: 'Ada & Sam', status: 'PLANNING', type_set: true },
      summary: { total: 3, covered: 1 },
      ...over,
    },
  },
});

describe('SuggestedServicesCard', () => {
  it('shows covered and to-do items with event-linked marketplace searches', async () => {
    (PlanningService.eventPlan as jest.Mock).mockResolvedValue(response());
    render(<SuggestedServicesCard eventId="e1" />);

    await waitFor(() => expect(screen.getByText('1 of 3 covered')).toBeInTheDocument());
    expect(PlanningService.eventPlan).toHaveBeenCalledWith('e1');
    expect(screen.getByText('✓ Venue set')).toBeInTheDocument();
    expect(screen.getAllByText('To do')).toHaveLength(2);

    const find = screen.getByRole('link', { name: 'Find vendors: Photography & Video' });
    expect(find).toHaveAttribute('href', '/marketplace?category_id=photo&date=2027-06-12&event=e1');
    // none free that day: browse the category, still for this event
    expect(screen.getByRole('link', { name: 'Browse all: Decor & Florals' })).toHaveAttribute('href', '/marketplace?category_id=decor&event=e1');
    // covered items don't offer actions
    expect(screen.queryByRole('link', { name: /Venues/ })).not.toBeInTheDocument();
  });

  it('adds a budget line at the suggested amount and marks it covered', async () => {
    (PlanningService.eventPlan as jest.Mock).mockResolvedValue(response());
    (EventsService.addBudgetItem as jest.Mock).mockResolvedValue({
      data: { success: true, data: { id: 'b1', category: 'Photography & Video', allocated: '6000.00', spent: '0.00' } },
    });
    const onBudgetAdded = jest.fn();
    const user = userEvent.setup();
    render(<SuggestedServicesCard eventId="e1" onBudgetAdded={onBudgetAdded} />);

    await user.click(await screen.findByRole('button', { name: 'Add to budget: Photography & Video, $6,000' }));

    await waitFor(() => expect(screen.getByText('2 of 3 covered')).toBeInTheDocument());
    expect(EventsService.addBudgetItem).toHaveBeenCalledWith('e1', { category: 'Photography & Video', allocated: 6000, note: 'Suggested split' });
    expect(onBudgetAdded).toHaveBeenCalledWith({ id: 'b1', category: 'Photography & Video', allocated: 6000, spent: 0 });
    expect(screen.getByText('✓ In budget')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add to budget: Photography/ })).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalled();
  });

  it('read-only events show no actions; no budget hides "Add to budget" with a hint', async () => {
    (PlanningService.eventPlan as jest.Mock).mockResolvedValue(
      response({ budget: null, items: items.map((i) => ({ ...i, suggested_budget: null })), event: { id: 'e1', name: 'x', status: 'PLANNING', type_set: false } }),
    );
    const { rerender } = render(<SuggestedServicesCard eventId="e1" />);
    await waitFor(() => expect(screen.getByText(/Add a total budget to see a suggested split/)).toBeInTheDocument());
    expect(screen.getByText(/Set the event type/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add to budget/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0);

    (PlanningService.eventPlan as jest.Mock).mockResolvedValue(response());
    rerender(<SuggestedServicesCard eventId="e1" readOnly refreshKey={2} />);
    await waitFor(() => expect(screen.getByText('1 of 3 covered')).toBeInTheDocument());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add to budget/ })).not.toBeInTheDocument();
  });

  it('says so when suggestions fail to load', async () => {
    (PlanningService.eventPlan as jest.Mock).mockRejectedValue(new Error('x'));
    render(<SuggestedServicesCard eventId="e1" />);
    await waitFor(() => expect(screen.getByText(/Suggestions aren.t available right now/)).toBeInTheDocument());
  });
});
