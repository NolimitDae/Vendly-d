import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeeSettings from './FeeSettings';
import DisputesPageContent from './DisputesPageContent';

jest.mock('@/service/admin/money.service', () => ({
  MoneyService: {
    settings: jest.fn(),
    updateSettings: jest.fn(),
    setCategoryFee: jest.fn(),
    flags: jest.fn(),
    setFlag: jest.fn(),
    deleteFlag: jest.fn(),
    disputes: jest.fn(),
    resolveDispute: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { MoneyService } from '@/service/admin/money.service';
import { toast } from 'react-toastify';

describe('FeeSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (MoneyService.settings as jest.Mock).mockResolvedValue({
      data: {
        data: {
          settings: [
            { key: 'customer_service_fee_percent', label: 'Vendly Protection fee (%)', kind: 'percent', value: '5' },
            { key: 'vendor_commission_percent', label: 'Vendor commission (%)', kind: 'percent', value: '0' },
          ],
          categories: [{ id: 'c1', name: 'Beauty', fee_percent: null, default_payment_plan: null }],
        },
      },
    });
    (MoneyService.flags as jest.Mock).mockResolvedValue({ data: { data: [{ key: 'rentals', enabled: false }] } });
    (MoneyService.updateSettings as jest.Mock).mockResolvedValue({ data: { success: true } });
    (MoneyService.setFlag as jest.Mock).mockResolvedValue({ data: { success: true } });
  });

  it('saves edited fee settings', async () => {
    const user = userEvent.setup();
    render(<FeeSettings />);
    const fee = await screen.findByLabelText('Vendly Protection fee (%)');
    await user.clear(fee);
    await user.type(fee, '6');
    await user.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => expect(MoneyService.updateSettings).toHaveBeenCalledWith({ customer_service_fee_percent: '6', vendor_commission_percent: '0' }));
    expect(toast.success).toHaveBeenCalledWith('Settings saved');
  });

  it('toggles a feature flag', async () => {
    const user = userEvent.setup();
    render(<FeeSettings />);
    await user.click(await screen.findByRole('switch', { name: /toggle rentals/i }));
    expect(MoneyService.setFlag).toHaveBeenCalledWith('rentals', true);
  });
});

describe('DisputesPageContent', () => {
  const dispute = {
    id: 'b1', status: 'COMPLETED', amount: 450, service_fee: 22.5, dispute_opened_at: '2026-10-10T00:00:00Z', dispute_reason: 'The makeup artist never arrived.',
    listing: { title: 'Bridal Glam' }, customer: { id: 'c', name: 'Amara', email: 'a@x.com' }, vendor: { id: 'v', name: 'Nia', email: 'n@x.com' }, paid: 472.5, has_proof: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (MoneyService.disputes as jest.Mock).mockResolvedValue({ data: { data: [dispute] } });
    (MoneyService.resolveDispute as jest.Mock).mockResolvedValue({ data: { success: true } });
    window.confirm = jest.fn(() => true);
  });

  it('shows the customer’s report and resolves with a full refund', async () => {
    const user = userEvent.setup();
    render(<DisputesPageContent />);
    expect(await screen.findByText(/never arrived/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /decide/i }));
    await user.click(screen.getByRole('button', { name: /full refund/i }));
    await user.type(screen.getByLabelText(/decision note/i), 'Vendor confirmed no-show');
    await user.click(screen.getByRole('button', { name: /^resolve$/i }));
    await waitFor(() => expect(MoneyService.resolveDispute).toHaveBeenCalledWith('b1', { action: 'refund', amount: undefined, note: 'Vendor confirmed no-show' }));
  });

  it('blocks a partial refund outside the held amount', async () => {
    const user = userEvent.setup();
    render(<DisputesPageContent />);
    await user.click(await screen.findByRole('button', { name: /decide/i }));
    await user.click(screen.getByRole('button', { name: /partial refund/i }));
    await user.type(screen.getByLabelText(/refund amount/i), '500');
    await user.type(screen.getByLabelText(/decision note/i), 'Split the difference');
    await user.click(screen.getByRole('button', { name: /^resolve$/i }));
    expect(MoneyService.resolveDispute).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});
