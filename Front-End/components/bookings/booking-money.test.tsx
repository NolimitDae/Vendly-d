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
  return { ...actual, PaymentsService: { timeline: jest.fn(), dispute: jest.fn() } };
});

jest.mock('@/service/payments/booking-money.service', () => ({
  BookingMoneyService: { cancelPreview: jest.fn() },
  downloadInvoice: jest.fn(),
  money: (n: number) => `$${n.toFixed(2)}`,
}));

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

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
    await user.type(screen.getByRole('textbox'), 'Double booked');
    await user.click(screen.getByRole('button', { name: /^cancel booking$/i }));

    await waitFor(() => expect(BookingService.cancel).toHaveBeenCalledWith('b1', 'Double booked'));
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
    expect(screen.getByRole('button', { name: /^cancel booking$/i })).toBeEnabled();
    unmount();
    // from the bookings list: a link to the booking page, which opens the report
    render(<CancelBookingDialog bookingId="b1" role="CUSTOMER" onClose={jest.fn()} bookingHref="/bookings/b1" />);
    expect(await screen.findByRole('link', { name: 'Report a problem' })).toHaveAttribute('href', '/bookings/b1?report=1');
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
