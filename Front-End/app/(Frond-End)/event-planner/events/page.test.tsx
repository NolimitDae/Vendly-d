import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EPEventsPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('@/service/events/events.service', () => ({
  EventsService: { list: jest.fn() },
}));

jest.mock('dayjs', () => {
  const dayjs = (d: any) => ({ format: () => 'Jan 1, 2025' });
  return dayjs;
});

import { EventsService } from '@/service/events/events.service';

const makeEvents = (n = 3, status = 'PLANNING') =>
  Array.from({ length: n }, (_, i) => ({
    id: `ev-${i}`,
    name: `Event ${i}`,
    type: 'WEDDING',
    status,
    date: new Date().toISOString(),
    venue: `Venue ${i}`,
    guest_count: 100,
    total_budget: 5000,
    _count: { bookings: 2, tasks: 3, budget_items: 1 },
  }));

describe('EPEventsPage', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('loading state', () => {
    it('shows skeleton rows while loading', () => {
      (EventsService.list as jest.Mock).mockReturnValue(new Promise(() => {}));
      render(<EPEventsPage />);
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });
  });

  describe('loaded with events', () => {
    it('renders page heading', async () => {
      (EventsService.list as jest.Mock).mockResolvedValue({
        data: { success: true, data: makeEvents() },
      });
      render(<EPEventsPage />);
      await waitFor(() => {
        expect(screen.getByText(/my events/i)).toBeInTheDocument();
      });
    });

    it('renders event cards', async () => {
      (EventsService.list as jest.Mock).mockResolvedValue({
        data: { success: true, data: makeEvents() },
      });
      render(<EPEventsPage />);
      await waitFor(() => {
        expect(screen.getByText('Event 0')).toBeInTheDocument();
        expect(screen.getByText('Event 1')).toBeInTheDocument();
      });
    });

    it('renders event count in subtitle', async () => {
      (EventsService.list as jest.Mock).mockResolvedValue({
        data: { success: true, data: makeEvents(2) },
      });
      render(<EPEventsPage />);
      await waitFor(() => {
        expect(screen.getByText(/2 events/i)).toBeInTheDocument();
      });
    });

    it('renders the "New Event" link', async () => {
      (EventsService.list as jest.Mock).mockResolvedValue({
        data: { success: true, data: makeEvents() },
      });
      render(<EPEventsPage />);
      await waitFor(() => {
        expect(screen.getByRole('link', { name: /new event/i })).toHaveAttribute(
          'href',
          '/event-planner/events/new',
        );
      });
    });
  });

  describe('status filter', () => {
    it('calls list with the selected status when a filter is clicked', async () => {
      (EventsService.list as jest.Mock).mockResolvedValue({
        data: { success: true, data: makeEvents() },
      });
      const user = userEvent.setup();
      render(<EPEventsPage />);
      await waitFor(() => screen.getByText('Event 0'));

      await user.click(screen.getByRole('button', { name: 'Confirmed' }));

      await waitFor(() => {
        expect(EventsService.list).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'CONFIRMED' }),
        );
      });
    });

    it('calls list without status when "All" filter is clicked', async () => {
      (EventsService.list as jest.Mock).mockResolvedValue({
        data: { success: true, data: makeEvents() },
      });
      const user = userEvent.setup();
      render(<EPEventsPage />);
      await waitFor(() => screen.getByText('Event 0'));

      await user.click(screen.getByRole('button', { name: 'Confirmed' }));
      await user.click(screen.getByRole('button', { name: 'All' }));

      await waitFor(() => {
        expect(EventsService.list).toHaveBeenLastCalledWith(
          expect.objectContaining({ status: undefined }),
        );
      });
    });
  });

  describe('empty state', () => {
    it('shows empty state message when no events', async () => {
      (EventsService.list as jest.Mock).mockResolvedValue({
        data: { success: true, data: [] },
      });
      render(<EPEventsPage />);
      await waitFor(() => {
        expect(screen.getByText(/no events yet/i)).toBeInTheDocument();
      });
    });

    it('shows create event link in empty state', async () => {
      (EventsService.list as jest.Mock).mockResolvedValue({
        data: { success: true, data: [] },
      });
      render(<EPEventsPage />);
      await waitFor(() => {
        expect(screen.getByRole('link', { name: /create event/i })).toBeInTheDocument();
      });
    });
  });
});
