import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CancelBookingDialog from './CancelBookingDialog';
import RefundCard from './RefundCard';
import InvoiceButton, { invoiceAvailable } from './InvoiceButton';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

jest.mock('@/service/booking/booking.service', () => ({
  BookingService: { cancel: jest.fn() },
}));

jest.mock('@/service/payments/payments.service', () => ({
  PaymentsService: { timeline: jest.fn() },
}));

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

  it('still lets the user cancel when the preview cannot load', async () => {
    (BookingMoneyService.cancelPreview as jest.Mock).mockRejectedValue({ response: { data: { message: 'Cannot cancel a booking in COMPLETED status' } } });
    render(<CancelBookingDialog bookingId="b1" role="CUSTOMER" onClose={jest.fn()} />);
    expect(await screen.findByText('Cannot cancel a booking in COMPLETED status')).toBeInTheDocument();
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
