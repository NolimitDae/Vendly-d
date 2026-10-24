import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PromosPageContent from './PromosPageContent';

jest.mock('@/service/admin/money.service', () => ({
  MoneyService: { promos: jest.fn(), createPromo: jest.fn(), updatePromo: jest.fn(), deactivatePromo: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { MoneyService } from '@/service/admin/money.service';

const promo = { id: 'p1', code: 'FIRST20', amount_off: '20', percent_off: null, uses: 3, max_uses: null, expires_at: null, active: true, once_per_customer: true, first_booking_only: false };

describe('PromosPageContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (MoneyService.promos as jest.Mock).mockResolvedValue({ data: { data: [promo] } });
    (MoneyService.createPromo as jest.Mock).mockResolvedValue({});
    (MoneyService.updatePromo as jest.Mock).mockResolvedValue({});
  });

  it('shows each code’s limits in the list', async () => {
    render(<PromosPageContent />);
    expect(await screen.findByLabelText('Once per customer for FIRST20')).toBeChecked();
    expect(screen.getByLabelText('First booking only for FIRST20')).not.toBeChecked();
  });

  it('creates a code with both limits switched on', async () => {
    render(<PromosPageContent />);
    await screen.findByText('FIRST20');
    await userEvent.type(screen.getByLabelText('Code'), 'welcome');
    await userEvent.type(screen.getByLabelText('Discount'), '20');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Once per customer' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'First booking only' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create code' }));
    await waitFor(() => expect(MoneyService.createPromo).toHaveBeenCalled());
    expect((MoneyService.createPromo as jest.Mock).mock.calls[0][0]).toMatchObject({ code: 'WELCOME', percent_off: 20, once_per_customer: true, first_booking_only: true });
  });

  it('switches a limit on an existing code', async () => {
    render(<PromosPageContent />);
    await userEvent.click(await screen.findByLabelText('First booking only for FIRST20'));
    expect(MoneyService.updatePromo).toHaveBeenCalledWith('p1', { first_booking_only: true });
  });
});
