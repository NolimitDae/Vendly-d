import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

function setupMocks(overrides: { bookings?: any[]; account?: any; summary?: any } = {}) {
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
      await waitFor(() => {
        expect(screen.getByText('1')).toBeInTheDocument();
      });
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
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
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
});
