import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CancelBookingDialog from './CancelBookingDialog';
import RefundCard from './RefundCard';
import InvoiceButton, { invoiceAvailable } from './InvoiceButton';
import PaymentTimeline from '@/components/payments/PaymentTimeline';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

jest.mock('@/service/booking/booking.service', () => ({
  BookingService: { cancel: jest.fn() },
}));

jest.mock('@/service/payments/payments.service', () => {
  const actual = jest.requireActual('@/service/payments/payments.service');
  return { ...actual, PaymentsService: { timeline: jest.fn(), dispute: jest.fn(), retry: jest.fn() } };
});

// the card picker: one saved card to choose
jest.mock('@/components/payments/SavedCards', () => ({
  __esModule: true,
  default: ({ onSelect }: any) => (
    <button type="button" onClick={() => onSelect('pm_other')}>
      Mastercard 4444
    </button>
  ),
}));

jest.mock('@/service/payments/booking-money.service', () => ({
  BookingMoneyService: { cancelPreview: jest.fn() },
  downloadInvoice: jest.fn(),
  money: (n: number) => `$${n.toFixed(2)}`,
}));

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import { BookingService } from '@/service/booking/booking.service';
import { PaymentsService } from '@/service/payments/payments.service';
import { BookingMoneyService, downloadInvoice } from '@/service/payments/booking-money.service';
import { toast } from 'react-toastify';

beforeEach(() => jest.clearAllMocks());

describe('CancelBookingDialog (vendor)', () => {
  it('tells the vendor what the customer gets back before they cancel, and sends their reason', async () => {
    (BookingMoneyService.cancelPreview as jest.Mock).mockResolvedValue({
      data: { data: { cancelled_by: 'VENDOR', refund_total: 472.5, refund_fee: 22.5, policy: null, message: 'The customer gets $472.50 back, Vendly Protection fee included. You keep nothing from this booking.' } },
    });
    (BookingService.cancel as jest.Mock).mockResolvedValue({ data: { success: true, data: { refund_summary: { refund_total: 472.5, message: 'The customer is getting $472.50 back.' } } } });
    const onCancelled = jest.fn();
    const user = userEvent.setup();
    render(<CancelBookingDialog bookingId="b1" role="VENDOR" onClose={jest.fn()} onCancelled={onCancelled} />);

    expect(await screen.findByText(/The customer gets \$472\.50 back/)).toBeInTheDocument();
    // the vendor's own list, without "Customer didn't pay" when nothing is overdue
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['safety_concern', 'emergency', 'double_booked', 'other']);
    await user.click(screen.getByRole('radio', { name: 'Double booked' }));
    await user.type(screen.getByRole('textbox'), 'Took another wedding by mistake');
    await user.click(screen.getByRole('button', { name: /^cancel booking$/i }));

    await waitFor(() => expect(BookingService.cancel).toHaveBeenCalledWith('b1', { reason_code: 'double_booked', note: 'Took another wedding by mistake' }));
    expect(onCancelled).toHaveBeenCalledWith(expect.objectContaining({ refund_total: 472.5 }));
    expect(await screen.findByText('The customer is getting $472.50 back.')).toBeInTheDocument();
    expect(screen.getByText(/Refund \$472\.50/)).toBeInTheDocument();
  });

  it('past the start of a booking the vendor never started, points the customer to Report a problem, and still lets them cancel', async () => {
    (BookingMoneyService.cancelPreview as jest.Mock).mockResolvedValue({
      data: { data: { cancelled_by: 'CUSTOMER', refund_total: 0, policy: null, message: "You won't get a refund.", report_problem_hint: 'The start time has passed and the vendor hasn’t started this booking. If they didn’t show up, report a problem instead.' } },
    });
    const onReportProblem = jest.fn();
    const user = userEvent.setup();
    const { unmount } = render(<CancelBookingDialog bookingId="b1" role="CUSTOMER" onClose={jest.fn()} onReportProblem={onReportProblem} />);
    expect(await screen.findByText(/If they didn’t show up, report a problem instead/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Report a problem' }));
    expect(onReportProblem).toHaveBeenCalled();
    await user.click(screen.getByRole('radio', { name: 'Other' }));
    expect(screen.getByRole('button', { name: /^cancel booking$/i })).toBeEnabled();
    unmount();
    // from the bookings list: a link to the booking page, which opens the report
    render(<CancelBookingDialog bookingId="b1" role="CUSTOMER" onClose={jest.fn()} bookingHref="/bookings/b1" />);
    expect(await screen.findByRole('link', { name: 'Report a problem' })).toHaveAttribute('href', '/bookings/b1?report=1');
  });

  it('while a payment is overdue the vendor can cancel for non-payment, and sees that it settles like the customer’s', async () => {
    const reasons = [
      { key: 'customer_didnt_pay', label: 'Customer didn’t pay' },
      { key: 'safety_concern', label: 'Safety concern' },
      { key: 'other', label: 'Other' },
    ];
    (BookingMoneyService.cancelPreview as jest.Mock).mockImplementation((_id: string, code?: string) =>
      Promise.resolve({
        data: {
          data: code
            ? { cancelled_by: 'CUSTOMER', refund_total: 0, vendor_keeps: 250, deposit_kept: 250, policy: null, reasons, message: 'Nothing is refunded to the customer. You keep the $250.00 deposit.' }
            : { cancelled_by: 'VENDOR', refund_total: 300, vendor_keeps: 0, policy: null, reasons, message: 'The customer gets $300.00 back, Vendly Protection fee included.' },
        },
      }),
    );
    (BookingService.cancel as jest.Mock).mockResolvedValue({ data: { success: true, data: { refund_summary: { refund_total: 0, message: 'You keep the $250.00 deposit.' } } } });
    const user = userEvent.setup();
    render(<CancelBookingDialog bookingId="b1" role="VENDOR" onClose={jest.fn()} />);
    expect(await screen.findByText(/The customer gets \$300\.00 back/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Customer didn’t pay' }));
    expect(await screen.findByText(/You keep the \$250\.00 deposit/)).toBeInTheDocument();
    expect(BookingMoneyService.cancelPreview).toHaveBeenLastCalledWith('b1', 'customer_didnt_pay');
    await user.click(screen.getByRole('button', { name: /^cancel booking$/i }));
    await waitFor(() => expect(BookingService.cancel).toHaveBeenCalledWith('b1', { reason_code: 'customer_didnt_pay', note: undefined }));
  });

  it('tells the customer their deposit is non-refundable', async () => {
    (BookingMoneyService.cancelPreview as jest.Mock).mockResolvedValue({
      data: { data: { cancelled_by: 'CUSTOMER', refund_total: 0, vendor_keeps: 250, deposit_kept: 250, policy: null, message: "You won't get a refund. Your deposit of $250.00 is non-refundable." } },
    });
    render(<CancelBookingDialog bookingId="b1" role="CUSTOMER" onClose={jest.fn()} />);
    expect(await screen.findByTestId('cancel-preview')).toHaveTextContent('Your deposit of $250.00 is non-refundable.');
    // the customer's list when the preview has none
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['plans_changed', 'found_another_vendor', 'event_cancelled', 'price', 'other']);
  });

  it('still lets the user cancel when the preview cannot load', async () => {
    (BookingMoneyService.cancelPreview as jest.Mock).mockRejectedValue({ response: { data: { message: 'Cannot cancel a booking in COMPLETED status' } } });
    render(<CancelBookingDialog bookingId="b1" role="CUSTOMER" onClose={jest.fn()} />);
    expect(await screen.findByText('Cannot cancel a booking in COMPLETED status')).toBeInTheDocument();
  });
});

describe('PaymentTimeline (possible no-show)', () => {
  const timeline = { plan: null, currency: 'usd', total: 420, paid: 0, outstanding: 0, dispute: null, installments: [], can_dispute: true, not_started: true, vendor_paid: 400 };

  it('offers Report a problem on a confirmed booking past its start, even one paid through Checkout', async () => {
    (PaymentsService.timeline as jest.Mock).mockResolvedValue({ data: { data: timeline } });
    const user = userEvent.setup();
    render(<PaymentTimeline bookingId="b1" bookingStatus="CONFIRMED" />);
    expect(await screen.findByTestId('no-show-hint')).toHaveTextContent('If they didn’t show up, report a problem');
    await user.click(screen.getByRole('button', { name: 'Report a problem' }));
    expect(screen.getByLabelText('What went wrong?')).toHaveValue('no_show');
  });

  it('opens the report straight away when asked to, and not when the API says no', async () => {
    (PaymentsService.timeline as jest.Mock).mockResolvedValue({ data: { data: timeline } });
    const { unmount } = render(<PaymentTimeline bookingId="b1" bookingStatus="CONFIRMED" startReporting />);
    expect(await screen.findByRole('form', { name: 'Report a problem' })).toBeInTheDocument();
    unmount();
    (PaymentsService.timeline as jest.Mock).mockResolvedValue({ data: { data: { ...timeline, can_dispute: false, not_started: false } } });
    const { container } = render(<PaymentTimeline bookingId="b1" bookingStatus="CONFIRMED" startReporting />);
    await waitFor(() => expect(PaymentsService.timeline).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe('PaymentTimeline (missed deposit on a deposit plan)', () => {
  const timeline = {
    plan: 'DEPOSIT_50', currency: 'usd', total: 840, paid: 0, outstanding: 840, dispute: null, can_dispute: false,
    payment_state: 'pending_deposit', payment_due_by: '2026-11-02T00:00:00Z',
    installments: [
      { id: 'i1', sequence: 1, label: '50% deposit', amount: 440, fee_amount: 40, due_at: '2026-11-01T12:00:00Z', status: 'SCHEDULED', attempts: 1, next_attempt_at: '2026-11-01T18:00:00Z', last_error: 'Your card was declined.', refunded_amount: 0 },
      { id: 'i2', sequence: 2, label: 'Balance', amount: 400, fee_amount: 0, due_at: '2026-12-01T12:00:00Z', status: 'SCHEDULED', attempts: 0, refunded_amount: 0 },
    ],
  };

  it('says when it must be paid by, and lets the customer pay now with their card or another one', async () => {
    (PaymentsService.timeline as jest.Mock).mockResolvedValue({ data: { data: timeline } });
    (PaymentsService.retry as jest.Mock).mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    render(<PaymentTimeline bookingId="b1" bookingStatus="CONFIRMED" />);
    expect(await screen.findByTestId('pay-by')).toHaveTextContent(/^Pending deposit: pay by .+, or the booking is cancelled\.$/);
    // only the missed deposit, not the balance that isn't due yet
    expect(screen.getAllByRole('button', { name: /now$/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Pay $440.00 now' }));
    await waitFor(() => expect(PaymentsService.retry).toHaveBeenCalledWith('b1', 'i1'));
    await user.click(screen.getByRole('button', { name: 'Use another card' }));
    await user.click(screen.getByRole('button', { name: 'Mastercard 4444' }));
    await user.click(screen.getByRole('button', { name: 'Pay $440.00 with this card' }));
    await waitFor(() => expect(PaymentsService.retry).toHaveBeenCalledWith('b1', 'i1', 'pm_other'));
  });

  it('a payment already going through (the automatic retry got there first) is shown as such, not as a failure', async () => {
    (PaymentsService.timeline as jest.Mock).mockResolvedValue({ data: { data: timeline } });
    (PaymentsService.retry as jest.Mock).mockRejectedValue({ response: { status: 409, data: { statusCode: 409, message: 'A payment is already going through.', error: 'Conflict' } } });
    const user = userEvent.setup();
    render(<PaymentTimeline bookingId="b1" bookingStatus="CONFIRMED" />);
    await user.click(await screen.findByRole('button', { name: 'Pay $440.00 now' }));
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('A payment is already going through.'));
    expect(toast.error).not.toHaveBeenCalled();
    // reloaded to show the payment in progress
    await waitFor(() => expect(PaymentsService.timeline).toHaveBeenCalledTimes(2));
  });
});

describe('RefundCard', () => {
  it('shows the amount, the card and when it lands', async () => {
    (PaymentsService.timeline as jest.Mock).mockResolvedValue({ data: { data: { refunded: 225, refund_card: 'Visa •••• 4242', refund_timing: '5–10 business days', currency: 'usd' } } });
    render(<RefundCard bookingId="b1" role="CUSTOMER" />);
    expect(await screen.findByText('$225.00')).toBeInTheDocument();
    expect(screen.getByText(/Back to Visa •••• 4242\. Refunds take 5–10 business days/)).toBeInTheDocument();
  });

  it('is hidden when nothing was refunded', async () => {
    (PaymentsService.timeline as jest.Mock).mockResolvedValue({ data: { data: { refunded: 0 } } });
    const { container } = render(<RefundCard bookingId="b1" role="CUSTOMER" />);
    await waitFor(() => expect(PaymentsService.timeline).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('InvoiceButton', () => {
  it('downloads the invoice, and says so when it fails', async () => {
    (downloadInvoice as jest.Mock).mockRejectedValueOnce(new Error('nope'));
    const user = userEvent.setup();
    render(<InvoiceButton bookingId="b1" />);
    await user.click(screen.getByRole('button', { name: /download invoice/i }));
    expect(downloadInvoice).toHaveBeenCalledWith('b1');
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('is offered for finished bookings that had a payment', () => {
    expect(invoiceAvailable({ status: 'COMPLETED', paid_at: '2026-10-01' })).toBe(true);
    expect(invoiceAvailable({ status: 'CANCELLED', paid_at: '2026-10-01' })).toBe(true);
    expect(invoiceAvailable({ status: 'CANCELLED', paid_at: null })).toBe(false);
    expect(invoiceAvailable({ status: 'CONFIRMED', paid_at: '2026-10-01' })).toBe(false);
  });
});
