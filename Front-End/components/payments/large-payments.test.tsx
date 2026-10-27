import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentTimeline from './PaymentTimeline';
import BankPaymentNotice from './BankPaymentNotice';
import SavedCards from './SavedCards';
import RefundCard from '@/components/bookings/RefundCard';
import { depositRuleText, feeRuleText } from '@/service/payments/payments.service';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
jest.mock('@/service/booking/booking.service', () => ({ BookingService: { getOne: jest.fn() } }));
jest.mock('@/service/payments/payments.service', () => {
  const actual = jest.requireActual('@/service/payments/payments.service');
  return { ...actual, PaymentsService: { timeline: jest.fn(), retry: jest.fn(), cards: jest.fn(), setupIntent: jest.fn(), removeCard: jest.fn(), setDefault: jest.fn() } };
});
jest.mock('@/service/payments/booking-money.service', () => ({ money: (n: number) => `$${n.toFixed(2)}` }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import { PaymentsService } from '@/service/payments/payments.service';

beforeEach(() => jest.clearAllMocks());

const clearing = {
  plan: 'DEPOSIT_50', currency: 'usd', total: 6500, paid: 0, outstanding: 6500, processing: 3500, dispute: null, can_dispute: false,
  payment_state: null, large: true, payment_due_hours: 48, bank_allowed: true, paying_by_bank: true,
  installments: [
    { id: 'i1', sequence: 1, label: '50% deposit', amount: 3500, fee_amount: 500, due_at: '2026-11-01T12:00:00Z', status: 'PROCESSING', clearing: true, by_bank: true, attempts: 1, refunded_amount: 0 },
    { id: 'i2', sequence: 2, label: 'Balance', amount: 3000, fee_amount: 0, due_at: '2026-12-01T12:00:00Z', status: 'SCHEDULED', attempts: 0, refunded_amount: 0 },
  ],
};

describe('bank payments on large bookings', () => {
  it('the customer sees a bank payment as Processing, not as a card hold or a failure', async () => {
    (PaymentsService.timeline as jest.Mock).mockResolvedValue({ data: { data: clearing } });
    render(<PaymentTimeline bookingId="b1" bookingStatus="CONFIRMED" />);
    expect(await screen.findByText(/^Processing · bank payment, clears in about 4 business days/)).toBeInTheDocument();
    expect(screen.queryByText(/Card held/)).not.toBeInTheDocument();
    expect(screen.getByTestId('bank-processing')).toHaveTextContent('Your bank payment of $3500.00 is processing. Bank payments take about 4 business days to clear; the vendor is paid only once it has.');
    expect(screen.getByText('$6500.00 to go ($3500.00 processing)')).toBeInTheDocument();
    // nothing to pay again meanwhile
    expect(screen.queryByRole('button', { name: /now$/ })).not.toBeInTheDocument();
  });

  it('a failed payment on a large booking can be paid with a card or a bank account', async () => {
    const failed = { ...clearing, processing: 0, payment_state: 'pending_balance', payment_due_by: '2026-11-03T12:00:00Z', installments: [{ ...clearing.installments[0], status: 'PAID', clearing: false }, { ...clearing.installments[1], status: 'FAILED', attempts: 1, last_error: 'The account has insufficient funds.' }] };
    (PaymentsService.timeline as jest.Mock).mockResolvedValue({ data: { data: failed } });
    (PaymentsService.cards as jest.Mock).mockResolvedValue({ data: { data: [] } });
    const user = userEvent.setup();
    render(<PaymentTimeline bookingId="b1" bookingStatus="CONFIRMED" />);
    await user.click(await screen.findByRole('button', { name: 'Use another card or a bank account' }));
    await waitFor(() => expect(PaymentsService.cards).toHaveBeenCalledWith({ bank: true }));
    expect(await screen.findByRole('button', { name: /Add a bank account/ })).toBeInTheDocument();
  });

  it('the vendor hears the payout waits for the bank payment to clear', async () => {
    (PaymentsService.timeline as jest.Mock).mockResolvedValue({ data: { data: clearing } });
    render(<BankPaymentNotice bookingId="b1" />);
    expect(await screen.findByTestId('bank-processing')).toHaveTextContent(/Processing: the customer is paying \$3500\.00 \(50% deposit\) from their bank account\. .*You’re paid for it once it has/);
  });

  it('nothing shows for the vendor when nothing is processing', async () => {
    (PaymentsService.timeline as jest.Mock).mockResolvedValue({ data: { data: { ...clearing, processing: 0 } } });
    const { container } = render(<BankPaymentNotice bookingId="b1" />);
    await waitFor(() => expect(PaymentsService.timeline).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('a refund to a bank account is on its way', async () => {
    (PaymentsService.timeline as jest.Mock).mockResolvedValue({ data: { data: { refunded: 1200, refund_by_bank: true, refund_card: 'Bank account •••• 6789', refund_timing: 'about 5 business days', currency: 'usd' } } });
    render(<RefundCard bookingId="b1" role="CUSTOMER" />);
    expect(await screen.findByText('Refund on its way')).toBeInTheDocument();
    expect(screen.getByText(/Back to Bank account •••• 6789\. Refunds take about 5 business days/)).toBeInTheDocument();
  });

  it('lists saved bank accounts with cards only where a bank account can pay', async () => {
    (PaymentsService.cards as jest.Mock).mockResolvedValue({
      data: { data: [{ id: 'pm_card', type: 'card', brand: 'visa', last4: '4242', exp_month: 1, exp_year: 2030, is_default: true }, { id: 'pm_bank', type: 'us_bank_account', last4: '6789', bank_name: 'STRIPE TEST BANK', is_default: false }] },
    });
    const onSelect = jest.fn();
    const user = userEvent.setup();
    render(<SavedCards selected="pm_card" onSelect={onSelect} allowBank />);
    expect(await screen.findByText('Bank account •••• 6789')).toBeInTheDocument();
    expect(screen.getByText(/STRIPE TEST BANK · Payments take about 4 business days to clear/)).toBeInTheDocument();
    await user.click(screen.getByText('Bank account •••• 6789'));
    expect(onSelect).toHaveBeenCalledWith('pm_bank');
    expect(PaymentsService.cards).toHaveBeenCalledWith({ bank: true });
  });

  it('a card-only picker doesn’t ask for bank accounts or offer to add one', async () => {
    (PaymentsService.cards as jest.Mock).mockResolvedValue({ data: { data: [] } });
    render(<SavedCards selected={null} onSelect={jest.fn()} />);
    await waitFor(() => expect(PaymentsService.cards).toHaveBeenCalledWith({}));
    expect(await screen.findByRole('button', { name: /Add a card/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add a bank account/ })).not.toBeInTheDocument();
  });

  it('words the fee cap and the 48 hours from the admin settings', () => {
    expect(feeRuleText({ fee_percent: 5, fee_maximum: 500 })).toBe('5%, up to $500');
    expect(feeRuleText({ fee_percent: 5, fee_maximum: null })).toBe('5%');
    expect(depositRuleText(5000)).toContain("within 12 hours of failing (48 hours on bookings of $5,000 or more)");
    expect(depositRuleText(null)).toContain('within 12 hours of failing (the booking is then cancelled)');
  });
});
