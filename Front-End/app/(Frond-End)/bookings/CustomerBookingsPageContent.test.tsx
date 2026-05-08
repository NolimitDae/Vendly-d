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
  },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { BookingService } from '@/service/booking/booking.service';
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
        expect(screen.getByText(/no bookings yet/i)).toBeInTheDocument();
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

    it('shows Pay Now button for PENDING bookings', async () => {
      setupSuccess();
      render(<CustomerBookingsPageContent />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /pay now/i })).toBeInTheDocument();
      });
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
      setupSuccess([makeBooking({ status: 'COMPLETED', review: null })]);
      render(<CustomerBookingsPageContent />);
      await waitFor(() => screen.getByText('COMPLETED'));
      expect(screen.queryByRole('button', { name: /pay now/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^cancel$/i })).not.toBeInTheDocument();
    });
  });

  describe('cancel action', () => {
    it('calls BookingService.cancel when user confirms cancellation', async () => {
      (BookingService.cancel as jest.Mock).mockResolvedValue({ data: { success: true } });
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

      await waitFor(() => {
        expect(BookingService.cancel).toHaveBeenCalledWith('b1', 'Customer cancelled');
      });
      expect(toast.success).toHaveBeenCalledWith('Booking cancelled');
    });

    it('shows error toast when cancel API fails', async () => {
      (BookingService.cancel as jest.Mock).mockRejectedValue(new Error('fail'));
      setupSuccess();
      const user = userEvent.setup();
      render(<CustomerBookingsPageContent />);

      await waitFor(() => screen.getByRole('button', { name: /^cancel$/i }));
      await user.click(screen.getByRole('button', { name: /^cancel$/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to cancel booking');
      });
    });
  });

  describe('status filter tabs', () => {
    it('renders filter buttons for all statuses', async () => {
      setupSuccess([]);
      render(<CustomerBookingsPageContent />);
      await waitFor(() => screen.getByText(/no bookings yet/i));

      expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^pending$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^confirmed$/i })).toBeInTheDocument();
    });

    it('calls API with correct status when filter tab is clicked', async () => {
      setupSuccess([]);
      const user = userEvent.setup();
      render(<CustomerBookingsPageContent />);

      await waitFor(() => screen.getByText(/no bookings yet/i));

      await user.click(screen.getByRole('button', { name: /^completed$/i }));

      await waitFor(() => {
        expect(BookingService.getMyAsCustomer).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'COMPLETED' }),
        );
      });
    });
  });

  describe('payment success/cancelled search param', () => {
    it('shows success toast when payment=success in query', async () => {
      mockSearchParams = new URLSearchParams('payment=success');
      setupSuccess([]);
      render(<CustomerBookingsPageContent />);
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          'Payment successful! Your booking is confirmed.',
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
