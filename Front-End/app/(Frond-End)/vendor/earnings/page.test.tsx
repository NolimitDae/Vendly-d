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

function setupMocks(overrides: { bookings?: any[]; account?: any } = {}) {
  (EarningsService.getBookings as jest.Mock).mockResolvedValue({
    data: { success: true, data: overrides.bookings ?? bookings },
  });
  (EarningsService.getTransactions as jest.Mock).mockResolvedValue({
    data: { success: true, data: [] },
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
      (EarningsService.getTransactions as jest.Mock).mockReturnValue(new Promise(() => {}));
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

    it('renders total earnings stat', async () => {
      setupMocks();
      render(<EarningsPage />);
      await waitFor(() => {
        // $200 completed × 0.9 (after 10% fee) = $180
        const matches = screen.getAllByText('$180.00');
        expect(matches.length).toBeGreaterThan(0);
      });
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
