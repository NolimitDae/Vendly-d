import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import EPDashboardPage from './page';

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

const makeEvents = (n = 3) =>
  Array.from({ length: n }, (_, i) => ({
    id: `ev-${i}`,
    name: `Event ${i}`,
    type: 'WEDDING',
    status: i === 0 ? 'PLANNING' : i === 1 ? 'COMPLETED' : 'CONFIRMED',
    date: new Date(Date.now() + 86400000 * (i + 1)).toISOString(),
    venue: `Venue ${i}`,
    total_budget: 5000,
    _count: { bookings: i, tasks: i + 1, budget_items: i },
  }));

describe('EPDashboardPage', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('loading state', () => {
    it('shows skeleton cards while loading', () => {
      (EventsService.list as jest.Mock).mockReturnValue(new Promise(() => {}));
      render(<EPDashboardPage />);
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });
  });

  describe('loaded state', () => {
    it('renders the dashboard heading', async () => {
      (EventsService.list as jest.Mock).mockResolvedValue({
        data: { success: true, data: makeEvents() },
      });
      render(<EPDashboardPage />);
      await waitFor(() => {
        expect(screen.getByText(/event planner dashboard/i)).toBeInTheDocument();
      });
    });

    it('renders total events stat', async () => {
      (EventsService.list as jest.Mock).mockResolvedValue({
        data: { success: true, data: makeEvents(4) },
      });
      render(<EPDashboardPage />);
      await waitFor(() => {
        expect(screen.getByText('4')).toBeInTheDocument();
      });
    });

    it('renders event names in upcoming list', async () => {
      (EventsService.list as jest.Mock).mockResolvedValue({
        data: { success: true, data: makeEvents() },
      });
      render(<EPDashboardPage />);
      await waitFor(() => {
        expect(screen.getByText('Event 0')).toBeInTheDocument();
      });
    });

    it('renders "New Event" link', async () => {
      (EventsService.list as jest.Mock).mockResolvedValue({
        data: { success: true, data: makeEvents() },
      });
      render(<EPDashboardPage />);
      await waitFor(() => {
        const links = screen.getAllByRole('link', { name: /new event/i });
        expect(links.length).toBeGreaterThan(0);
        expect(links[0]).toHaveAttribute('href', '/event-planner/events/new');
      });
    });
  });

  describe('empty state', () => {
    it('shows no upcoming events message when list is empty', async () => {
      (EventsService.list as jest.Mock).mockResolvedValue({
        data: { success: true, data: [] },
      });
      render(<EPDashboardPage />);
      await waitFor(() => {
        expect(screen.getByText(/no upcoming events/i)).toBeInTheDocument();
      });
    });
  });
});
