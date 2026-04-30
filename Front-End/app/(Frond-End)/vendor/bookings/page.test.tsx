import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VendorBookingsPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt }: any) => <img alt={alt} />,
}));

jest.mock('@/service/booking/booking.service', () => ({
  BookingService: {
    getMyAsVendor: jest.fn(),
    confirm: jest.fn(),
    reject: jest.fn(),
    startWork: jest.fn(),
    complete: jest.fn(),
    cancel: jest.fn(),
  },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

import { BookingService } from '@/service/booking/booking.service';
import { toast } from 'react-toastify';

const makeBooking = (overrides: Partial<any> = {}) => ({
  id: 'b1',
  status: 'PENDING',
  created_at: '2024-03-01T10:00:00Z',
  amount: 200,
  message: 'Looking forward to it',
  listing: { id: 'l1', title: 'DJ Services', images: [] },
  customer: { id: 'c1', name: 'Jane Doe', email: 'jane@example.com' },
  ...overrides,
});

function setupSuccess(bookings: any[]) {
  (BookingService.getMyAsVendor as jest.Mock).mockResolvedValue({
    data: {
      success: true,
      data: bookings,
      meta: { total: bookings.length, last_page: 1 },
    },
  });
}

describe('VendorBookingsPage', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('loading state', () => {
    it('shows spinner while loading', () => {
      (BookingService.getMyAsVendor as jest.Mock).mockReturnValue(new Promise(() => {}));
      render(<VendorBookingsPage />);
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows error toast when fetch fails', async () => {
      (BookingService.getMyAsVendor as jest.Mock).mockRejectedValue(new Error('Network'));
      render(<VendorBookingsPage />);
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to load bookings');
      });
    });
  });

  describe('empty state', () => {
    it('shows "No bookings yet" when list is empty', async () => {
      setupSuccess([]);
      render(<VendorBookingsPage />);
      await waitFor(() => {
        expect(screen.getByText(/no bookings yet/i)).toBeInTheDocument();
      });
    });
  });

  describe('loaded state', () => {
    it('renders listing title and customer name', async () => {
      setupSuccess([makeBooking()]);
      render(<VendorBookingsPage />);

      await waitFor(() => {
        expect(screen.getByText('DJ Services')).toBeInTheDocument();
      });
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    it('renders the status badge', async () => {
      setupSuccess([makeBooking({ status: 'CONFIRMED' })]);
      render(<VendorBookingsPage />);

      await waitFor(() => {
        expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
      });
    });

    it('renders the booking amount', async () => {
      setupSuccess([makeBooking()]);
      render(<VendorBookingsPage />);

      await waitFor(() => {
        expect(screen.getByText('$200.00')).toBeInTheDocument();
      });
    });

    it('renders the customer message in italics', async () => {
      setupSuccess([makeBooking()]);
      render(<VendorBookingsPage />);

      await waitFor(() => {
        expect(screen.getByText(/"Looking forward to it"/i)).toBeInTheDocument();
      });
    });
  });

  describe('PENDING booking actions', () => {
    it('shows Confirm and Reject buttons for PENDING bookings', async () => {
      setupSuccess([makeBooking({ status: 'PENDING' })]);
      render(<VendorBookingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^confirm$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument();
      });
    });

    it('calls BookingService.confirm and shows success toast', async () => {
      (BookingService.confirm as jest.Mock).mockResolvedValue({ data: { success: true } });
      (BookingService.getMyAsVendor as jest.Mock)
        .mockResolvedValueOnce({
          data: { success: true, data: [makeBooking()], meta: { total: 1, last_page: 1 } },
        })
        .mockResolvedValueOnce({
          data: { success: true, data: [makeBooking({ status: 'CONFIRMED' })], meta: { total: 1, last_page: 1 } },
        });

      const user = userEvent.setup();
      render(<VendorBookingsPage />);

      await waitFor(() => screen.getByRole('button', { name: /^confirm$/i }));
      await user.click(screen.getByRole('button', { name: /^confirm$/i }));

      await waitFor(() => {
        expect(BookingService.confirm).toHaveBeenCalledWith('b1');
      });
      expect(toast.success).toHaveBeenCalledWith('Updated successfully');
    });

    it('calls BookingService.reject and shows success toast', async () => {
      (BookingService.reject as jest.Mock).mockResolvedValue({ data: { success: true } });
      setupSuccess([makeBooking()]);
      const user = userEvent.setup();
      render(<VendorBookingsPage />);

      await waitFor(() => screen.getByRole('button', { name: /reject/i }));
      await user.click(screen.getByRole('button', { name: /reject/i }));

      await waitFor(() => {
        expect(BookingService.reject).toHaveBeenCalledWith('b1');
      });
      expect(toast.success).toHaveBeenCalledWith('Updated successfully');
    });

    it('shows error toast when confirm fails', async () => {
      (BookingService.confirm as jest.Mock).mockRejectedValue(new Error('fail'));
      setupSuccess([makeBooking()]);
      const user = userEvent.setup();
      render(<VendorBookingsPage />);

      await waitFor(() => screen.getByRole('button', { name: /^confirm$/i }));
      await user.click(screen.getByRole('button', { name: /^confirm$/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Action failed');
      });
    });
  });

  describe('CONFIRMED booking actions', () => {
    it('shows Start Work button for CONFIRMED bookings', async () => {
      setupSuccess([makeBooking({ status: 'CONFIRMED' })]);
      render(<VendorBookingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /start work/i })).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /^confirm$/i })).not.toBeInTheDocument();
    });

    it('calls BookingService.startWork when Start Work is clicked', async () => {
      (BookingService.startWork as jest.Mock).mockResolvedValue({ data: { success: true } });
      setupSuccess([makeBooking({ status: 'CONFIRMED' })]);
      const user = userEvent.setup();
      render(<VendorBookingsPage />);

      await waitFor(() => screen.getByRole('button', { name: /start work/i }));
      await user.click(screen.getByRole('button', { name: /start work/i }));

      await waitFor(() => {
        expect(BookingService.startWork).toHaveBeenCalledWith('b1');
      });
    });
  });

  describe('IN_PROGRESS booking actions', () => {
    it('shows Mark Complete button for IN_PROGRESS bookings', async () => {
      setupSuccess([makeBooking({ status: 'IN_PROGRESS' })]);
      render(<VendorBookingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /mark complete/i })).toBeInTheDocument();
      });
    });

    it('calls BookingService.complete when Mark Complete is clicked', async () => {
      (BookingService.complete as jest.Mock).mockResolvedValue({ data: { success: true } });
      setupSuccess([makeBooking({ status: 'IN_PROGRESS' })]);
      const user = userEvent.setup();
      render(<VendorBookingsPage />);

      await waitFor(() => screen.getByRole('button', { name: /mark complete/i }));
      await user.click(screen.getByRole('button', { name: /mark complete/i }));

      await waitFor(() => {
        expect(BookingService.complete).toHaveBeenCalledWith('b1');
      });
    });
  });

  describe('status filter tabs', () => {
    it('renders all filter tabs', async () => {
      setupSuccess([]);
      render(<VendorBookingsPage />);

      await waitFor(() => screen.getByText(/no bookings yet/i));

      expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^pending$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^confirmed$/i })).toBeInTheDocument();
    });

    it('calls API with correct status filter', async () => {
      setupSuccess([]);
      const user = userEvent.setup();
      render(<VendorBookingsPage />);

      await waitFor(() => screen.getByText(/no bookings yet/i));

      await user.click(screen.getByRole('button', { name: /^pending$/i }));

      await waitFor(() => {
        expect(BookingService.getMyAsVendor).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'PENDING' }),
        );
      });
    });
  });

  describe('pagination', () => {
    it('renders page number buttons when last_page > 1', async () => {
      (BookingService.getMyAsVendor as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          data: [makeBooking()],
          meta: { total: 20, last_page: 3 },
        },
      });
      render(<VendorBookingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument();
      });
    });
  });
});
