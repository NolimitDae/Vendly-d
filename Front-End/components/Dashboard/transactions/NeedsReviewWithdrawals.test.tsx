import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NeedsReviewWithdrawals from './NeedsReviewWithdrawals';

jest.mock('@/service/admin/money.service', () => ({
  MoneyService: { needsReviewWithdrawals: jest.fn(), settleWithdrawal: jest.fn() },
}));
jest.mock('@/service/contracts/contracts.service', () => ({
  apiError: (e: any, fallback = 'Something went wrong') => e?.response?.data?.message ?? fallback,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { MoneyService } from '@/service/admin/money.service';
import { toast } from 'react-toastify';

const row = { id: 'w1', amount: 150, currency: 'usd', created_at: '2026-10-24T09:00:00Z', user: { id: 'v1', name: 'Bloom Florals', email: 'b@x.test', stripe_connect_id: 'acct_1' } };

describe('NeedsReviewWithdrawals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    (MoneyService.settleWithdrawal as jest.Mock).mockResolvedValue({ data: { success: true } });
  });

  it('lists withdrawals to check and returns the money to the balance', async () => {
    (MoneyService.needsReviewWithdrawals as jest.Mock).mockResolvedValueOnce({ data: { data: [row] } }).mockResolvedValueOnce({ data: { data: [] } });
    const user = userEvent.setup();
    render(<NeedsReviewWithdrawals />);
    expect(await screen.findByText('$150.00 · Bloom Florals')).toBeInTheDocument();
    expect(screen.getByText(/withdraw-w1 · acct_1/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /return to balance/i }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Put $150.00 back in Bloom Florals'));
    await waitFor(() => expect(MoneyService.settleWithdrawal).toHaveBeenCalledWith('w1', 'returned'));
    expect(toast.success).toHaveBeenCalledWith("Money returned to the vendor's balance");
    await waitFor(() => expect(screen.queryByText('$150.00 · Bloom Florals')).not.toBeInTheDocument());
  });

  it('marks one completed, and shows the server’s message when it was already settled', async () => {
    (MoneyService.needsReviewWithdrawals as jest.Mock).mockResolvedValue({ data: { data: [row] } });
    (MoneyService.settleWithdrawal as jest.Mock).mockRejectedValue({ response: { data: { message: 'This withdrawal was already settled.' } } });
    const user = userEvent.setup();
    render(<NeedsReviewWithdrawals />);
    await user.click(await screen.findByRole('button', { name: 'Mark completed' }));
    await waitFor(() => expect(MoneyService.settleWithdrawal).toHaveBeenCalledWith('w1', 'completed'));
    expect(toast.error).toHaveBeenCalledWith('This withdrawal was already settled.');
  });

  it('shows nothing when there is nothing to check', async () => {
    (MoneyService.needsReviewWithdrawals as jest.Mock).mockResolvedValue({ data: { data: [] } });
    const { container } = render(<NeedsReviewWithdrawals />);
    await waitFor(() => expect(MoneyService.needsReviewWithdrawals).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
