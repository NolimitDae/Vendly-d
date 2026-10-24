import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EarningsPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('@/service/earnings/earnings.service', () => ({
  EarningsService: {
    getBookings: jest.fn(),
    getSummary: jest.fn(),
    getDashboardStats: jest.fn(),
    getTransactions: jest.fn(),
    getWithdrawHistory: jest.fn(),
    getAccountInfo: jest.fn(),
    getStripeBalance: jest.fn(),
    connectAccount: jest.fn(),
    createConnectedAccount: jest.fn(),
    getOnboardingLink: jest.fn(),
    requestPayout: jest.fn(),
  },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// Recharts resize observer mock
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

import { EarningsService } from '@/service/earnings/earnings.service';

const bookings: any[] = [
  {
    id: 'b-1',
    status: 'COMPLETED',
    amount: '200.00',
    currency: 'usd',
    created_at: '2024-01-15T10:00:00Z',
    completed_at: '2024-01-16T10:00:00Z',
    customer: { id: 'c-1', name: 'Jane Doe', avatar_url: null },
    listing: { id: 'l-1', title: 'Photography', price: '200.00' },
  },
  {
    id: 'b-2',
    status: 'PENDING',
    amount: '150.00',
    currency: 'usd',
    created_at: '2024-02-10T10:00:00Z',
    completed_at: null,
    customer: { id: 'c-2', name: 'Bob Smith', avatar_url: null },
    listing: { id: 'l-2', title: 'Videography', price: '150.00' },
  },
];

const accountInfo: any = {
  hasConnectedAccount: true,
  accountId: 'acct_456',
  email: 'vendor@test.com',
  name: 'Test Vendor',
};

const summary: any = {
  earned: 190,
  held: 75,
  commission: 10,
  given_back: 4.5,
  balance: 42.25,
  commission_percent: 5,
  bookings: [
    { booking_id: 'b-1', earned: 190, held: 0, commission: 10 },
    { booking_id: 'b-2', earned: 0, held: 75, commission: 0 },
  ],
};

const stats: any = {
  revenue_by_month: [
    { month: '2026-05', label: 'May', earned: 0 },
    { month: '2026-06', label: 'Jun', earned: 0 },
    { month: '2026-07', label: 'Jul', earned: 0 },
    { month: '2026-08', label: 'Aug', earned: 120 },
    { month: '2026-09', label: 'Sep', earned: 0 },
    { month: '2026-10', label: 'Oct', earned: 70 },
  ],
  total_earned: 190,
  bookings: { total: 2, by_status: { PENDING: 1, CONFIRMED: 0, IN_PROGRESS: 0, COMPLETED: 1, CANCELLED: 0, REJECTED: 0 }, upcoming: 0 },
  rating: { average: 4.5, count: 2 },
  top_clients: [{ id: 'c-1', name: 'Jane Doe', avatar_url: null, earned: 190, bookings: 1 }],
};

function setupMocks(overrides: { bookings?: any[]; account?: any; summary?: any; stats?: any } = {}) {
  (EarningsService.getDashboardStats as jest.Mock).mockResolvedValue({
    data: { success: true, data: overrides.stats ?? stats },
  });
  (EarningsService.getSummary as jest.Mock).mockResolvedValue({
    data: { success: true, data: overrides.summary ?? summary },
  });
  (EarningsService.getBookings as jest.Mock).mockResolvedValue({
    data: { success: true, data: overrides.bookings ?? bookings },
  });
  (EarningsService.getWithdrawHistory as jest.Mock).mockResolvedValue({
    data: { success: true, data: [] },
  });
  (EarningsService.getAccountInfo as jest.Mock).mockResolvedValue({
    data: { success: true, data: overrides.account ?? accountInfo },
  });
  (EarningsService.getStripeBalance as jest.Mock).mockResolvedValue({
    data: {
      success: true,
      data: {
        available: { amount: 0, display: '$0.00' },
        pending: { amount: 0, display: '$0.00' },
      },
    },
  });
}

describe('EarningsPage', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('loading state', () => {
    it('shows skeleton while loading', () => {
      (EarningsService.getBookings as jest.Mock).mockReturnValue(new Promise(() => {}));
      (EarningsService.getAccountInfo as jest.Mock).mockReturnValue(new Promise(() => {}));
      render(<EarningsPage />);
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });
  });

  describe('loaded state', () => {
    it('renders earnings page heading', async () => {
      setupMocks();
      render(<EarningsPage />);
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /earnings/i, level: 1 })).toBeInTheDocument();
      });
    });

    it('renders the real earned figure from the backend, not a guessed fee', async () => {
      setupMocks();
      render(<EarningsPage />);
      await waitFor(() => {
        // released to the vendor after the commission actually taken
        expect(screen.getAllByText('$190.00').length).toBeGreaterThan(0);
      });
      expect(screen.queryByText(/10% fee/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/10% platform fee/i)).not.toBeInTheDocument();
      expect(screen.queryByText('$180.00')).not.toBeInTheDocument();
    });

    it('shows held money, commission taken and money given back', async () => {
      setupMocks();
      render(<EarningsPage />);
      await waitFor(() => {
        expect(screen.getByText('Held until release · 5% commission at payout')).toBeInTheDocument();
      });
      expect(screen.getAllByText('$75.00').length).toBeGreaterThan(0);
      expect(screen.getByText('Released to you · $10.00 Vendly commission')).toBeInTheDocument();
      expect(screen.getByText(/\$10\.00 Vendly commission · \$4\.50 given back · 2 total bookings/)).toBeInTheDocument();
      // per booking: the real commission and what is still held
      expect(screen.getByText('−$10.00')).toBeInTheDocument();
      expect(screen.getByText('+$75.00 held')).toBeInTheDocument();
    });

    it('offers the Vendly balance as the full payout amount', async () => {
      setupMocks();
      render(<EarningsPage />);
      expect(await screen.findByRole('button', { name: 'Request full Vendly balance ($42.25)' })).toBeInTheDocument();
    });

    it('says "Held until release" when no commission is set', async () => {
      setupMocks({ summary: { ...summary, commission_percent: 0 } });
      render(<EarningsPage />);
      expect(await screen.findByText('Held until release')).toBeInTheDocument();
    });

    it('renders completed bookings count', async () => {
      setupMocks();
      render(<EarningsPage />);
      // the tile's value (the top clients list numbers its rows too)
      const tile = (await screen.findByText('Completed Bookings')).parentElement!;
      expect(within(tile).getByText('1')).toBeInTheDocument();
    });

    it('renders listing name in bookings table', async () => {
      setupMocks();
      render(<EarningsPage />);
      await waitFor(() => {
        expect(screen.getByText('Photography')).toBeInTheDocument();
      });
    });

    it('renders customer name in bookings table', async () => {
      setupMocks();
      render(<EarningsPage />);
      await waitFor(() => {
        expect(within(screen.getByRole('table')).getByText('Jane Doe')).toBeInTheDocument();
      });
    });

    it('renders CSV export button', async () => {
      setupMocks();
      render(<EarningsPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    it('shows empty state when no bookings', async () => {
      setupMocks({ bookings: [] });
      render(<EarningsPage />);
      await waitFor(() => {
        const matches = screen.getAllByText(/no bookings yet/i);
        expect(matches.length).toBeGreaterThan(0);
      });
    });
  });

  describe('dashboard stats from the server', () => {
    it('asks for six months and shows this month’s earnings from them', async () => {
      setupMocks();
      render(<EarningsPage />);
      expect(await screen.findByText('$70.00')).toBeInTheDocument();
      expect(EarningsService.getDashboardStats).toHaveBeenCalledWith(6);
      expect(screen.getByText('Last 6 months · released to you, after commission and refunds')).toBeInTheDocument();
    });

    it('counts bookings from the server, not just the loaded page', async () => {
      setupMocks({ stats: { ...stats, bookings: { total: 40, by_status: { COMPLETED: 31, PENDING: 2, CONFIRMED: 5, IN_PROGRESS: 1, CANCELLED: 1, REJECTED: 0 }, upcoming: 6 } } });
      render(<EarningsPage />);
      expect(await screen.findByText('31')).toBeInTheDocument();
      expect(screen.getByText('8 in progress')).toBeInTheDocument();
      expect(screen.getByText('78%')).toBeInTheDocument();
    });

    it('lists the top clients and the average rating', async () => {
      setupMocks();
      render(<EarningsPage />);
      expect(await screen.findByRole('heading', { name: 'Top Clients' })).toBeInTheDocument();
      const list = screen.getByRole('list');
      expect(list).toHaveTextContent('Jane Doe');
      expect(list).toHaveTextContent('1 booking');
      expect(list).toHaveTextContent('$190.00');
      expect(screen.getByText(/from 2 reviews/)).toHaveTextContent('Average rating 4.5 from 2 reviews');
    });

    it('explains an empty top clients list', async () => {
      setupMocks({ stats: { ...stats, top_clients: [] } });
      render(<EarningsPage />);
      expect(await screen.findByText('Your top clients show here once bookings are paid out.')).toBeInTheDocument();
    });
  });
});
