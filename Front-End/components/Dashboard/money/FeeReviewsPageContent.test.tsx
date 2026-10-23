import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeeReviewsPageContent from './FeeReviewsPageContent';

jest.mock('@/service/add-ons/add-ons.service', () => ({
  BookingExtrasService: { adminList: jest.fn(), adminReview: jest.fn() },
}));
jest.mock('@/service/contracts/contracts.service', () => ({
  ContractsService: { adminBooking: jest.fn(), downloadLink: jest.fn() },
  apiError: (e: any, fallback = 'Something went wrong') => e?.response?.data?.message ?? fallback,
  openContractFile: jest.fn(),
}));
jest.mock('@/service/admin/money.service', () => ({ MoneyService: {} }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { BookingExtrasService } from '@/service/add-ons/add-ons.service';
import { toast } from 'react-toastify';

const row = {
  id: 'ex-1',
  kind: 'FEE',
  name: 'Late return',
  label: 'Late return: $50.00 × 2 hours',
  amount: 100,
  fee_amount: 0,
  total: 100,
  note: 'Chairs came back late',
  status: 'IN_REVIEW',
  decline_reason: 'They were on time',
  responded_at: '2030-06-03T10:00:00Z',
  review_requested_at: '2030-06-04T10:00:00Z',
  review_note: 'Photos show 9pm',
  reviewed_at: null,
  booking: {
    id: 'b1',
    status: 'COMPLETED',
    completed_at: '2030-06-02T10:00:00Z',
    amount: 900,
    currency: 'usd',
    listing: { title: 'Chair rental' },
    customer: { id: 'c1', name: 'Cathy', email: 'cathy@example.com' },
    vendor: { id: 'v1', name: 'Vic', email: 'vic@example.com' },
    has_proof: true,
  },
};

describe('FeeReviewsPageContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    (BookingExtrasService.adminList as jest.Mock).mockResolvedValue({ data: { data: [row] } });
  });

  it('lists fees waiting for review with both sides of the story', async () => {
    render(<FeeReviewsPageContent />);
    expect(await screen.findByText('Late return: $50.00 × 2 hours')).toBeInTheDocument();
    expect(BookingExtrasService.adminList).toHaveBeenCalledWith('open');
    expect(screen.getByText('Chairs came back late')).toBeInTheDocument();
    expect(screen.getByText('They were on time')).toBeInTheDocument();
    expect(screen.getByText(/cathy@example.com/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view contract/i })).toBeInTheDocument();
  });

  it('needs a note, then charges the fee', async () => {
    (BookingExtrasService.adminReview as jest.Mock).mockResolvedValue({ data: { data: { action: 'charge', paid: true } } });
    const user = userEvent.setup();
    render(<FeeReviewsPageContent />);
    await user.click(await screen.findByRole('button', { name: 'Decide' }));
    await user.click(screen.getByRole('button', { name: 'Charge $100.00' }));
    expect(toast.error).toHaveBeenCalledWith('Add a short note explaining the decision');
    expect(BookingExtrasService.adminReview).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Decision note'), 'Contract says 7pm return');
    await user.click(screen.getByRole('button', { name: 'Charge $100.00' }));
    await waitFor(() => expect(BookingExtrasService.adminReview).toHaveBeenCalledWith('ex-1', 'charge', 'Contract says 7pm return'));
    expect(toast.success).toHaveBeenCalledWith('Fee charged; both sides were emailed');
  });

  it('waives a fee', async () => {
    (BookingExtrasService.adminReview as jest.Mock).mockResolvedValue({ data: { data: { action: 'waive', paid: false } } });
    const user = userEvent.setup();
    render(<FeeReviewsPageContent />);
    await user.click(await screen.findByRole('button', { name: 'Decide' }));
    await user.type(screen.getByLabelText('Decision note'), 'No proof of the time');
    await user.click(screen.getByRole('button', { name: 'Waive' }));
    await waitFor(() => expect(BookingExtrasService.adminReview).toHaveBeenCalledWith('ex-1', 'waive', 'No proof of the time'));
  });
});
