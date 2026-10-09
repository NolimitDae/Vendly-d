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

jest.mock('@/service/contracts/contracts.service', () => {
  const actual = jest.requireActual('@/service/contracts/contracts.service');
  return {
    ...actual,
    ContractsService: { bookingPreview: jest.fn() },
  };
});

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { BookingService } from '@/service/booking/booking.service';
import { ContractsService } from '@/service/contracts/contracts.service';
import { toast } from 'react-toastify';

const listing = {
  id: 'listing-1',
  title: 'DJ Service',
  price: 500,
  price_unit: 'night',
  vendor: { id: 'vendor-1', name: 'DJ Bob' },
};

const preview = {
  title: 'Service Agreement',
  body: '# Service Agreement\n\n## 1. Parties\nDJ Bob and you.',
  content_sha256: 'a'.repeat(64),
  preview_token: 'token-1',
  source_pdf_url: null,
  consent_text: 'I agree to sign electronically and receive this contract electronically.',
  missing_message: null,
};

async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/event date/i), '2030-06-01');
  await user.type(screen.getByLabelText(/start time/i), '18:00');
  await user.type(screen.getByLabelText(/venue address/i), 'Grand Hall');
  await user.type(screen.getByLabelText(/guest count/i), '120');
}

describe('BookingModal', () => {
  const onClose = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  it('renders listing title and price', () => {
    render(<BookingModal listing={listing} onClose={onClose} />);
    expect(screen.getByText('DJ Service')).toBeInTheDocument();
    expect(screen.getByText(/\$500\.00/)).toBeInTheDocument();
  });

  it('asks for the event details the contract needs', () => {
    render(<BookingModal listing={listing} onClose={onClose} />);
    expect(screen.getByLabelText(/event date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/start time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/end time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/venue address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/guest count/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/booking comments/i)).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<BookingModal listing={listing} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not request a contract when the listing has no vendor', async () => {
    const user = userEvent.setup();
    render(<BookingModal listing={{ ...listing, vendor: undefined }} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /review contract/i }));
    expect(ContractsService.bookingPreview).not.toHaveBeenCalled();
  });

  it('blocks sending when the contract is missing required fields', async () => {
    (ContractsService.bookingPreview as jest.Mock).mockResolvedValue({
      data: { data: { ...preview, missing_message: "The contract can't be sent yet. Missing: venue address." } },
    });
    const user = userEvent.setup();
    render(<BookingModal listing={listing} onClose={onClose} />);
    await user.type(screen.getByLabelText(/event date/i), '2030-06-01');
    await user.click(screen.getByRole('button', { name: /review contract/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("The contract can't be sent yet. Missing: venue address."));
    expect(screen.queryByText(/sign & send request/i)).not.toBeInTheDocument();
  });

  it('only enables signing after consent and a typed name', async () => {
    (ContractsService.bookingPreview as jest.Mock).mockResolvedValue({ data: { data: preview } });
    const user = userEvent.setup();
    render(<BookingModal listing={listing} onClose={onClose} />);
    await fillDetails(user);
    await user.click(screen.getByRole('button', { name: /review contract/i }));

    const sign = await screen.findByRole('button', { name: /sign & send request/i });
    expect(screen.getByText('DJ Bob and you.')).toBeInTheDocument();
    expect(sign).toBeDisabled();
    await user.click(screen.getByLabelText(/sign electronically/i));
    expect(sign).toBeDisabled();
    await user.type(screen.getByLabelText(/full legal name/i), 'Jane Customer');
    expect(sign).toBeEnabled();
  });

  it('signs, sends the request and moves to payment', async () => {
    (ContractsService.bookingPreview as jest.Mock).mockResolvedValue({ data: { data: preview } });
    (BookingService.create as jest.Mock).mockResolvedValue({ data: { success: true, data: { id: 'booking-1' } } });
    const onBookingCreated = jest.fn();
    const user = userEvent.setup();
    render(<BookingModal listing={listing} eventId="event-1" onClose={onClose} onBookingCreated={onBookingCreated} />);
    await fillDetails(user);
    await user.click(screen.getByRole('button', { name: /review contract/i }));
    await user.click(await screen.findByLabelText(/sign electronically/i));
    await user.type(screen.getByLabelText(/full legal name/i), 'Jane Customer');
    await user.click(screen.getByRole('button', { name: /sign & send request/i }));

    await waitFor(() => expect(BookingService.create).toHaveBeenCalled());
    const sent = (BookingService.create as jest.Mock).mock.calls[0][0];
    expect(sent).toMatchObject({
      listing_id: 'listing-1',
      vendor_id: 'vendor-1',
      venue_address: 'Grand Hall',
      guest_count: 120,
      event_id: 'event-1',
      preview_token: 'token-1',
      signature: { legal_name: 'Jane Customer', consent: true, content_sha256: preview.content_sha256 },
    });
    expect(ContractsService.bookingPreview).toHaveBeenCalledWith(expect.objectContaining({ event_id: 'event-1' }));
    expect(onBookingCreated).toHaveBeenCalledWith('booking-1');
    expect(await screen.findByRole('button', { name: /pay now/i })).toBeInTheDocument();
  });

  it('reloads the contract when it changed before signing', async () => {
    (ContractsService.bookingPreview as jest.Mock).mockResolvedValue({ data: { data: preview } });
    (BookingService.create as jest.Mock).mockRejectedValue({ response: { status: 409, data: { message: 'changed' } } });
    const user = userEvent.setup();
    render(<BookingModal listing={listing} onClose={onClose} />);
    await fillDetails(user);
    await user.click(screen.getByRole('button', { name: /review contract/i }));
    await user.click(await screen.findByLabelText(/sign electronically/i));
    await user.type(screen.getByLabelText(/full legal name/i), 'Jane Customer');
    await user.click(screen.getByRole('button', { name: /sign & send request/i }));

    await waitFor(() => expect(toast.info).toHaveBeenCalled());
    expect(ContractsService.bookingPreview).toHaveBeenCalledTimes(2);
  });

  it('starts Stripe checkout for the new booking from the payment step', async () => {
    (ContractsService.bookingPreview as jest.Mock).mockResolvedValue({ data: { data: preview } });
    (BookingService.create as jest.Mock).mockResolvedValue({ data: { success: true, data: { id: 'booking-1' } } });
    (BookingService.createCheckout as jest.Mock).mockResolvedValue({
      data: { success: true, data: { checkout_url: 'https://checkout.stripe.test/s' } },
    });
    const user = userEvent.setup();
    render(<BookingModal listing={listing} onClose={onClose} />);
    await fillDetails(user);
    await user.click(screen.getByRole('button', { name: /review contract/i }));
    await user.click(await screen.findByLabelText(/sign electronically/i));
    await user.type(screen.getByLabelText(/full legal name/i), 'Jane Customer');
    await user.click(screen.getByRole('button', { name: /sign & send request/i }));
    await user.click(await screen.findByRole('button', { name: /pay now/i }));

    await waitFor(() => expect(BookingService.createCheckout).toHaveBeenCalledWith('booking-1'));
  });
});
