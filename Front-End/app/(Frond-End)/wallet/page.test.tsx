import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WalletPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/service/wallet/wallet.service', () => ({
  WalletService: {
    getAccountInfo: jest.fn(),
    getBalance: jest.fn(),
    getStripeBalance: jest.fn(),
    getTransactions: jest.fn(),
    connectAccount: jest.fn(),
    createConnectedAccount: jest.fn(),
    getOnboardingLink: jest.fn(),
    requestPayout: jest.fn(),
    deposit: jest.fn(),
    withdraw: jest.fn(),
  },
}));

jest.mock('@/service/auth/auth.service', () => ({
  AuthService: { me: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
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

import { WalletService } from '@/service/wallet/wallet.service';
import { AuthService } from '@/service/auth/auth.service';

const connectedAccount: any = {
  hasConnectedAccount: true,
  accountId: 'acct_123',
  email: 'vendor@test.com',
  name: 'Test Vendor',
};

const balance: any = {
  available: { amount: 1500, display: '$15.00', currency: 'usd' },
  pending: { amount: 500, display: '$5.00', currency: 'usd' },
  total: { amount: 2000, display: '$20.00' },
};

const transactions: any[] = [
  {
    id: 'tx-1',
    type: 'payout',
    status: 'completed',
    amount: '100.00',
    currency: 'usd',
    reference_number: 'REF001',
    created_at: new Date().toISOString(),
  },
];

function setupMocks(overrides: { account?: any; balance?: any; txs?: any[] } = {}) {
  (AuthService.me as jest.Mock).mockResolvedValue({
    data: { success: true, data: { id: 'u-1', name: 'Test Vendor', type: 'VENDOR' } },
  });
  (WalletService.getAccountInfo as jest.Mock).mockResolvedValue({
    data: { success: true, data: overrides.account ?? connectedAccount },
  });
  (WalletService.getStripeBalance as jest.Mock).mockResolvedValue({
    data: {
      success: true,
      data: overrides.balance ?? {
        available: { amount: 15, display: '$15.00', currency: 'usd' },
        pending: { amount: 5, display: '$5.00', currency: 'usd' },
        total: { amount: 20, display: '$20.00' },
      },
    },
  });
  (WalletService.getTransactions as jest.Mock).mockResolvedValue({
    data: { success: true, data: overrides.txs ?? transactions, meta: { total: 1, last_page: 1 } },
  });
}

describe('WalletPage', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('loading state', () => {
    it('shows skeleton loaders while fetching', () => {
      (AuthService.me as jest.Mock).mockReturnValue(new Promise(() => {}));
      (WalletService.getAccountInfo as jest.Mock).mockReturnValue(new Promise(() => {}));
      (WalletService.getStripeBalance as jest.Mock).mockReturnValue(new Promise(() => {}));
      (WalletService.getTransactions as jest.Mock).mockReturnValue(new Promise(() => {}));
      render(<WalletPage />);
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('connected account', () => {
    it('renders the wallet heading', async () => {
      setupMocks();
      render(<WalletPage />);
      await waitFor(() => {
        expect(screen.getByText(/wallet/i)).toBeInTheDocument();
      });
    });

    it('renders available balance', async () => {
      setupMocks();
      render(<WalletPage />);
      await waitFor(() => {
        const els = screen.getAllByText('$15.00');
        expect(els.length).toBeGreaterThan(0);
      });
    });

    it('renders pending balance', async () => {
      setupMocks();
      render(<WalletPage />);
      await waitFor(() => {
        expect(screen.getByText(/\$5\.00/)).toBeInTheDocument();
      });
    });

    it('renders transaction type label', async () => {
      setupMocks();
      render(<WalletPage />);
      await waitFor(() => {
        expect(screen.getByText('Payout')).toBeInTheDocument();
      });
    });

    it('renders transaction reference number', async () => {
      setupMocks();
      render(<WalletPage />);
      await waitFor(() => {
        expect(screen.getByText('REF001')).toBeInTheDocument();
      });
    });
  });

  describe('no connected account', () => {
    it('shows connect account prompt when not connected', async () => {
      setupMocks({
        account: { hasConnectedAccount: false, accountId: null, email: '', name: '' },
        balance: null,
      });
      render(<WalletPage />);
      await waitFor(() => {
        const matches = screen.getAllByText(/connect.*stripe/i);
        expect(matches.length).toBeGreaterThan(0);
      });
    });
  });

  describe('empty transactions', () => {
    it('shows empty state when there are no transactions', async () => {
      setupMocks({ txs: [] });
      render(<WalletPage />);
      await waitFor(() => {
        expect(screen.getByText(/no transactions/i)).toBeInTheDocument();
      });
    });
  });
});
