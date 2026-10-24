import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomerBookingsPageContent from './CustomerBookingsPageContent';

// Mutable so individual tests can override it for search-param tests
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/',
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt }: any) => <img alt={alt} />,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

jest.mock('@/service/booking/booking.service', () => ({
  BookingService: {
    getMyAsCustomer: jest.fn(),
    cancel: jest.fn(),
    createCheckout: jest.fn(),
  },
}));

jest.mock('@/service/review/review.service', () => ({
  ReviewService: {
    create: jest.fn(),
    pending: jest.fn().mockResolvedValue({ data: { data: [] } }),
    dismiss: jest.fn(),
  },
}));

jest.mock('@/service/payments/booking-money.service', () => ({
  BookingMoneyService: { cancelPreview: jest.fn() },
  downloadInvoice: jest.fn(),
  money: (n: number) => `$${n.toFixed(2)}`,
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { BookingService } from '@/service/booking/booking.service';
import { BookingMoneyService } from '@/service/payments/booking-money.service';
import { toast } from 'react-toastify';

const makeBooking = (overrides: Partial<any> = {}) => ({
  id: 'b1',
  status: 'PENDING',
  created_at: '2024-03-01T10:00:00Z',
  amount: 150,
  listing: { id: 'l1', title: 'Wedding Photography', price: 150, images: [] },
  vendor: { id: 'v1', name: 'John Photographer' },
  review: null,
  ...overrides,
});

function setupSuccess(bookings: any[] = [makeBooking()]) {
  (BookingService.getMyAsCustomer as jest.Mock).mockResolvedValue({
    data: {
      success: true,
      data: bookings,
      meta: { total: bookings.length, last_page: 1 },
    },
  });
}

describe('CustomerBookingsPageContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    // Direct assignment is more reliable than jest.spyOn for built-in globals
    window.confirm = jest.fn().mockReturnValue(true);
  });

  describe('loading state', () => {
    it('shows a spinner while fetching', () => {
      (BookingService.getMyAsCustomer as jest.Mock).mockReturnValue(new Promise(() => {}));
      render(<CustomerBookingsPageContent />);
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows an error toast when fetch fails', async () => {
      (BookingService.getMyAsCustomer as jest.Mock).mockRejectedValue(new Error('Network'));
      render(<CustomerBookingsPageContent />);
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to load bookings');
      });
    });
  });

  describe('empty state', () => {
    it('shows empty state message when no bookings', async () => {
      (BookingService.getMyAsCustomer as jest.Mock).mockResolvedValue({
        data: { success: true, data: [], meta: { total: 0, last_page: 1 } },
      });
      render(<CustomerBookingsPageContent />);
      await waitFor(() => {
        expect(screen.getByText(/nothing coming up yet/i)).toBeInTheDocument();
      });
    });
  });

  describe('loaded state', () => {
    it('renders booking listing title and vendor name', async () => {
      setupSuccess();
      render(<CustomerBookingsPageContent />);
      await waitFor(() => {
        expect(screen.getByText('Wedding Photography')).toBeInTheDocument();
      });
      expect(screen.getByText(/john photographer/i)).toBeInTheDocument();
    });

    it('renders the booking status badge', async () => {
      setupSuccess();
      render(<CustomerBookingsPageContent />);
      await waitFor(() => {
        expect(screen.getByText('PENDING')).toBeInTheDocument();
      });
    });

    it('renders the booking amount', async () => {
      setupSuccess();
      render(<CustomerBookingsPageContent />);
      await waitFor(() => {
        expect(screen.getByText('$150.00')).toBeInTheDocument();
      });
    });

    it('does not offer payment before the vendor accepts and signs', async () => {
      setupSuccess();
      render(<CustomerBookingsPageContent />);
      await waitFor(() => {
        expect(screen.getByText(/waiting for the vendor to accept/i)).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /pay now/i })).not.toBeInTheDocument();
    });

    it('shows Pay Now once the vendor has signed and the booking is unpaid', async () => {
      setupSuccess([makeBooking({ status: 'CONFIRMED', paid_at: null })]);
      render(<CustomerBookingsPageContent />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /pay now/i })).toBeInTheDocument();
      });
    });

    it('shows Paid instead of Pay Now after payment', async () => {
      setupSuccess([makeBooking({ status: 'CONFIRMED', paid_at: '2030-01-01T00:00:00Z' })]);
      render(<CustomerBookingsPageContent />);
      await waitFor(() => {
        expect(screen.getByText('Paid')).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /pay now/i })).not.toBeInTheDocument();
    });

    it('shows Cancel button for PENDING bookings', async () => {
      setupSuccess();
      render(<CustomerBookingsPageContent />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
      });
    });

    it('shows Leave Review button for COMPLETED bookings without review', async () => {
      setupSuccess([makeBooking({ status: 'COMPLETED', review: null })]);
      render(<CustomerBookingsPageContent />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /leave review/i })).toBeInTheDocument();
      });
    });

    it('shows "Reviewed" for COMPLETED bookings that already have a review', async () => {
      setupSuccess([makeBooking({ status: 'COMPLETED', review: { id: 'r1', rating: 4 } })]);
      render(<CustomerBookingsPageContent />);
      await waitFor(() => {
        expect(screen.getByText(/reviewed \(4\/5\)/i)).toBeInTheDocument();
      });
    });

    it('does not show Pay Now or Cancel for COMPLETED bookings', async () => {
      // paid: an unpaid one (pay after service) still offers Pay Now
      setupSuccess([makeBooking({ status: 'COMPLETED', review: null, paid_at: '2030-01-01T00:00:00Z' })]);
      render(<CustomerBookingsPageContent />);
      await waitFor(() => screen.getByText('COMPLETED'));
      expect(screen.queryByRole('button', { name: /pay now/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^cancel$/i })).not.toBeInTheDocument();
    });
  });

  describe('cancel action', () => {
    const preview = {
      cancelled_by: 'CUSTOMER', refund_total: 75, refund_fee: 0, fee_kept: 7.5, vendor_keeps: 75, percent: 50, unpaid_cancelled: 0, holds_released: 0,
      policy: { key: 'flexible', label: 'Flexible', text: 'Full refund at 7+ days.' }, card: 'Visa •••• 4242', refund_timing: '5–10 business days',
      message: "You'll get $75.00 back to your card (Visa •••• 4242). The $7.50 Vendly Protection fee isn't refunded.",
    };
    beforeEach(() => {
      (BookingMoneyService.cancelPreview as jest.Mock).mockResolvedValue({ data: { success: true, data: preview } });
    });

    it('shows what cancelling does before confirming, then cancels and shows the refund', async () => {
      (BookingService.cancel as jest.Mock).mockResolvedValue({
        data: { success: true, data: { id: 'b1', refund_summary: { ...preview, message: '$75.00 is being refunded to your card (Visa •••• 4242).' } } },
      });
      (BookingService.getMyAsCustomer as jest.Mock)
        .mockResolvedValueOnce({
          data: { success: true, data: [makeBooking()], meta: { total: 1, last_page: 1 } },
        })
        .mockResolvedValueOnce({
          data: { success: true, data: [], meta: { total: 0, last_page: 1 } },
        });

      const user = userEvent.setup();
      render(<CustomerBookingsPageContent />);

      await waitFor(() => screen.getByRole('button', { name: /^cancel$/i }));
      await user.click(screen.getByRole('button', { name: /^cancel$/i }));

      // the preview, before anything is cancelled
      expect(await screen.findByText(/You'll get \$75\.00 back to your card/)).toBeInTheDocument();
      expect(screen.getByText(/Flexible cancellation policy/)).toBeInTheDocument();
      expect(BookingMoneyService.cancelPreview).toHaveBeenCalledWith('b1');
      expect(BookingService.cancel).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: /^cancel booking$/i }));

      await waitFor(() => {
        expect(BookingService.cancel).toHaveBeenCalledWith('b1', 'Customer cancelled');
      });
      expect(toast.success).toHaveBeenCalledWith('Booking cancelled');
      expect(await screen.findByText('$75.00 is being refunded to your card (Visa •••• 4242).')).toBeInTheDocument();
      expect(screen.getByText(/5–10 business days/)).toBeInTheDocument();
    });

    it('keeps the booking when the user changes their mind', async () => {
      setupSuccess();
      const user = userEvent.setup();
      render(<CustomerBookingsPageContent />);
      await waitFor(() => screen.getByRole('button', { name: /^cancel$/i }));
      await user.click(screen.getByRole('button', { name: /^cancel$/i }));
      await user.click(await screen.findByRole('button', { name: /keep booking/i }));
      expect(BookingService.cancel).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows an error when the cancel API fails', async () => {
      (BookingService.cancel as jest.Mock).mockRejectedValue(new Error('fail'));
      setupSuccess();
      const user = userEvent.setup();
      render(<CustomerBookingsPageContent />);

      await waitFor(() => screen.getByRole('button', { name: /^cancel$/i }));
      await user.click(screen.getByRole('button', { name: /^cancel$/i }));
      await screen.findByText(/You'll get/);
      await user.click(screen.getByRole('button', { name: /^cancel booking$/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent('fail');
      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe('tabs', () => {
    it('shows Active, Upcoming, Pending and Complete, starting on Upcoming', async () => {
      setupSuccess([]);
      render(<CustomerBookingsPageContent />);
      await waitFor(() => screen.getByText(/nothing coming up yet/i));

      expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Active', 'Upcoming', 'Pending', 'Complete']);
      expect(screen.getByRole('tab', { name: 'Upcoming' })).toHaveAttribute('aria-selected', 'true');
      expect(BookingService.getMyAsCustomer).toHaveBeenCalledWith(expect.objectContaining({ tab: 'upcoming', page: 1 }));
    });

    it('asks the API for the tab that is clicked', async () => {
      setupSuccess([]);
      const user = userEvent.setup();
      render(<CustomerBookingsPageContent />);
      await waitFor(() => screen.getByText(/nothing coming up yet/i));

      await user.click(screen.getByRole('tab', { name: 'Complete' }));
      await waitFor(() => {
        expect(BookingService.getMyAsCustomer).toHaveBeenLastCalledWith(expect.objectContaining({ tab: 'complete' }));
      });
      expect(await screen.findByText(/no past bookings yet/i)).toBeInTheDocument();
    });

    it('says what happened to bookings that did not go ahead', async () => {
      setupSuccess([
        makeBooking({ id: 'b1', status: 'REJECTED', expired_at: '2030-01-01T00:00:00Z' }),
        makeBooking({ id: 'b2', status: 'REJECTED', expired_at: null }),
        makeBooking({ id: 'b3', status: 'CANCELLED' }),
      ]);
      render(<CustomerBookingsPageContent />);
      expect(await screen.findByText('EXPIRED')).toBeInTheDocument();
      expect(screen.getByText('DECLINED')).toBeInTheDocument();
      expect(screen.getByText('CANCELLED')).toBeInTheDocument();
    });
  });

  describe('payment success/cancelled search param', () => {
    it('shows success toast when payment=success in query', async () => {
      mockSearchParams = new URLSearchParams('payment=success');
      setupSuccess([]);
      render(<CustomerBookingsPageContent />);
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          'Payment received. Thank you!',
        );
      });
    });

    it('shows info toast when payment=cancelled in query', async () => {
      mockSearchParams = new URLSearchParams('payment=cancelled');
      setupSuccess([]);
      render(<CustomerBookingsPageContent />);
      await waitFor(() => {
        expect(toast.info).toHaveBeenCalledWith(
          'Payment cancelled. You can pay from your bookings page.',
        );
      });
    });
  });
});
