import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransactionsList from './TransactionsList';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

jest.mock('@/service/payments/booking-money.service', () => ({
  BookingMoneyService: { transactions: jest.fn() },
  money: (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`,
}));

import { BookingMoneyService } from '@/service/payments/booking-money.service';

const row = (over: Record<string, unknown>) => ({
  id: 'r1', date: '2026-10-01T12:00:00Z', type: 'payment', kind: 'charge', description: 'Full payment from Ben', booking_id: 'b1', booking_title: 'DJ Night', amount: 200, currency: 'usd', status: 'pending',
  ...over,
});

const page = (data: any[], over: Record<string, unknown> = {}) => ({
  data: { success: true, data, meta: { total: data.length, page: 1, limit: 20, last_page: 1, role: 'vendor' }, totals: { in: 200, out: 45 }, ...over },
});

beforeEach(() => jest.clearAllMocks());

describe('TransactionsList', () => {
  it('lists a vendor’s money with status, sign and a link to the booking', async () => {
    (BookingMoneyService.transactions as jest.Mock).mockResolvedValue(page([row({}), row({ id: 'r2', type: 'fee', description: 'Vendly commission', amount: -45, status: 'completed' })]));
    render(<TransactionsList role="vendor" />);
    expect(await screen.findByText('Full payment from Ben')).toBeInTheDocument();
    expect(screen.getByText('+$200.00')).toBeInTheDocument();
    expect(screen.getByText('−$45.00')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'DJ Night' })[0]).toHaveAttribute('href', '/vendor/bookings/b1');
    expect(BookingMoneyService.transactions).toHaveBeenCalledWith({ role: 'vendor', type: 'all', q: undefined, page: 1, limit: 20 });
  });

  it('filters with the chips and searches by booking', async () => {
    (BookingMoneyService.transactions as jest.Mock).mockResolvedValue(page([row({})]));
    const user = userEvent.setup();
    render(<TransactionsList role="vendor" />);
    await screen.findByText('Full payment from Ben');

    await user.click(screen.getByRole('button', { name: 'Payouts' }));
    await waitFor(() => expect(BookingMoneyService.transactions).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'payout', page: 1 })));
    expect(screen.getByRole('button', { name: 'Payouts' })).toHaveAttribute('aria-pressed', 'true');

    await user.type(screen.getByRole('searchbox', { name: /search by booking/i }), 'dj');
    await waitFor(() => expect(BookingMoneyService.transactions).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'payout', q: 'dj' })));
  });

  it('shows an empty state for customers with no history', async () => {
    (BookingMoneyService.transactions as jest.Mock).mockResolvedValue(page([]));
    render(<TransactionsList role="customer" />);
    expect(await screen.findByText('Your payments and refunds will show here.')).toBeInTheDocument();
    // customers filter by payments, fees and refunds (no payouts)
    expect(screen.queryByRole('button', { name: 'Payouts' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refunds' })).toBeInTheDocument();
  });

  it('loads more pages', async () => {
    (BookingMoneyService.transactions as jest.Mock)
      .mockResolvedValueOnce(page([row({})], { meta: { total: 2, page: 1, limit: 20, last_page: 2, role: 'vendor' } }))
      .mockResolvedValueOnce(page([row({ id: 'r9', description: 'Paid to your bank account', type: 'payout', amount: 405, status: 'completed' })], { meta: { total: 2, page: 2, limit: 20, last_page: 2, role: 'vendor' } }));
    const user = userEvent.setup();
    render(<TransactionsList role="vendor" />);
    await user.click(await screen.findByRole('button', { name: /show more \(1 left\)/i }));
    expect(await screen.findByText('Paid to your bank account')).toBeInTheDocument();
    expect(screen.getByText('Full payment from Ben')).toBeInTheDocument();
  });
});
