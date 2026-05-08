import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookingModal from './BookingModal';

jest.mock('@/service/booking/booking.service', () => ({
  BookingService: {
    create: jest.fn(),
    createCheckout: jest.fn(),
  },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

import { BookingService } from '@/service/booking/booking.service';
import { toast } from 'react-toastify';

const listing = {
  id: 'listing-1',
  title: 'DJ Service',
  price: 500,
  price_unit: 'night',
  vendor: { id: 'vendor-1', name: 'DJ Bob' },
};

describe('BookingModal', () => {
  const onClose = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  it('renders listing title and price', () => {
    render(<BookingModal listing={listing} onClose={onClose} />);
    expect(screen.getByText('DJ Service')).toBeInTheDocument();
    expect(screen.getByText(/\$500\.00/)).toBeInTheDocument();
  });

  it('renders date/time and message inputs', () => {
    render(<BookingModal listing={listing} onClose={onClose} />);
    expect(screen.getByLabelText(/preferred date/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/describe your requirements/i)).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<BookingModal listing={listing} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows error toast when listing has no vendor', async () => {
    const user = userEvent.setup();
    render(<BookingModal listing={{ ...listing, vendor: undefined }} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /continue/i }));
    // No API call should have been made
    expect(BookingService.create).not.toHaveBeenCalled();
  });

  it('advances to payment step after successful booking creation', async () => {
    (BookingService.create as jest.Mock).mockResolvedValue({
      data: { success: true, data: { id: 'booking-123' } },
    });
    const user = userEvent.setup();
    render(<BookingModal listing={listing} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByText(/booking request created/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /pay now/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pay later/i })).toBeInTheDocument();
  });

  it('calls onBookingCreated with booking id on success', async () => {
    (BookingService.create as jest.Mock).mockResolvedValue({
      data: { success: true, data: { id: 'booking-123' } },
    });
    const onBookingCreated = jest.fn();
    const user = userEvent.setup();
    render(<BookingModal listing={listing} onClose={onClose} onBookingCreated={onBookingCreated} />);
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(onBookingCreated).toHaveBeenCalledWith('booking-123');
    });
  });

  it('shows error toast when booking creation fails', async () => {
    (BookingService.create as jest.Mock).mockResolvedValue({
      data: { success: false, message: 'Vendor unavailable' },
    });
    const user = userEvent.setup();
    render(<BookingModal listing={listing} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Vendor unavailable');
    });
  });

  it('shows error toast when booking creation throws', async () => {
    (BookingService.create as jest.Mock).mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    render(<BookingModal listing={listing} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to create booking');
    });
  });

  it('calls onClose when Pay Later is clicked', async () => {
    (BookingService.create as jest.Mock).mockResolvedValue({
      data: { success: true, data: { id: 'booking-123' } },
    });
    const user = userEvent.setup();
    render(<BookingModal listing={listing} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => screen.getByRole('button', { name: /pay later/i }));
    await user.click(screen.getByRole('button', { name: /pay later/i }));
    expect(onClose).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/booking request sent/i),
    );
  });

  it('calls createCheckout with booking id when Pay Now is clicked', async () => {
    (BookingService.create as jest.Mock).mockResolvedValue({
      data: { success: true, data: { id: 'booking-123' } },
    });
    (BookingService.createCheckout as jest.Mock).mockResolvedValue({
      data: { success: true, data: { checkout_url: 'https://checkout.stripe.com/pay/xxx' } },
    });

    const user = userEvent.setup();
    render(<BookingModal listing={listing} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => screen.getByRole('button', { name: /pay now/i }));
    await user.click(screen.getByRole('button', { name: /pay now/i }));
    await waitFor(() => {
      expect(BookingService.createCheckout).toHaveBeenCalledWith('booking-123');
    });
  });
});
