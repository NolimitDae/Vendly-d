import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeeSettings from './FeeSettings';
import DisputesPageContent from './DisputesPageContent';
import { ContractsService } from '@/service/contracts/contracts.service';

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
jest.mock('@/service/contracts/contracts.service', () => ({
  ContractsService: { adminBooking: jest.fn(), downloadLink: jest.fn() },
  apiError: (e: any, fallback = 'Something went wrong') => e?.response?.data?.message ?? fallback,
  openContractFile: jest.fn(),
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

  it('shows the signed contract for the disputed booking', async () => {
    (ContractsService.adminBooking as jest.Mock).mockResolvedValue({
      data: {
        data: [{
          id: 'k1', version: 1, title: 'Bridal Glam agreement', status: 'EXECUTED', verification_code: 'ABC123', content_sha256: 'f'.repeat(64),
          executed_pdf_key: 'contracts/k1.pdf', rendered_body: 'The vendor arrives by 9am.',
          signatures: [{ id: 's1', role: 'CUSTOMER', legal_name: 'Amara Obi', signed_at: '2026-10-01T10:00:00Z' }],
          auditEvents: [{ id: 'e1', created_at: '2026-10-01T10:00:00Z', action: 'SIGNED', actor: { name: 'Amara' } }],
        }],
      },
    });
    const user = userEvent.setup();
    render(<DisputesPageContent />);
    await user.click(await screen.findByRole('button', { name: 'View contract' }));
    expect(ContractsService.adminBooking).toHaveBeenCalledWith('b1');
    expect(await screen.findByText(/Bridal Glam agreement/)).toBeInTheDocument();
    expect(screen.getByText('Amara Obi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Signed PDF' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide contract' }));
    expect(screen.queryByText(/Bridal Glam agreement/)).not.toBeInTheDocument();
  });

  it('says so when the booking has no contract', async () => {
    (ContractsService.adminBooking as jest.Mock).mockRejectedValue({ response: { data: { message: 'No contracts for this booking.' } } });
    const user = userEvent.setup();
    render(<DisputesPageContent />);
    await user.click(await screen.findByRole('button', { name: 'View contract' }));
    expect(await screen.findByText('No contracts for this booking.')).toBeInTheDocument();
  });

  it('shows the kind of problem, what the customer asks for and their photos, and starts a partial refund at the amount asked', async () => {
    (MoneyService.disputes as jest.Mock).mockResolvedValue({
      data: { data: [{ ...dispute, dispute_category: 'late', dispute_outcome: 'partial_refund', dispute_requested_amount: 120, dispute_photo_urls: ['https://api.test/api/dispute-files/t1', 'https://api.test/api/dispute-files/t2'] }] },
    });
    const user = userEvent.setup();
    render(<DisputesPageContent />);
    expect(await screen.findByText('Vendor was late')).toBeInTheDocument();
    expect(screen.getByText('Partial refund of $120.00')).toBeInTheDocument();
    const photos = screen.getAllByRole('img', { name: /photo \d of 2/i });
    expect(photos).toHaveLength(2);
    expect(photos[0].closest('a')).toHaveAttribute('href', 'https://api.test/api/dispute-files/t1');
    expect(photos[0].closest('a')).toHaveAttribute('target', '_blank');

    await user.click(screen.getByRole('button', { name: /decide/i }));
    await user.click(screen.getByRole('button', { name: /partial refund/i }));
    expect(screen.getByLabelText(/refund amount/i)).toHaveValue('120.00');
    await user.type(screen.getByLabelText(/decision note/i), 'Arrived an hour late');
    await user.click(screen.getByRole('button', { name: /^resolve$/i }));
    await waitFor(() => expect(MoneyService.resolveDispute).toHaveBeenCalledWith('b1', { action: 'partial_refund', amount: 120, note: 'Arrived an hour late' }));
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
