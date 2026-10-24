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

jest.mock('@/components/payments/SavedCards', () => ({
  __esModule: true,
  default: ({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) => {
    const React = require('react');
    React.useEffect(() => { if (!selected) onSelect('pm_default'); }, [selected, onSelect]);
    return <p>Visa •••• 4242</p>;
  },
}));

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
  pricing: {
    price: 500,
    service_fee: 25,
    total: 525,
    plan: 'DEPOSIT_50',
    schedule: [
      { label: '50% deposit', amount: 275, due_at: '2030-05-01T00:00:00Z', capture_manually: false },
      { label: 'Balance', amount: 250, due_at: '2030-05-25T00:00:00Z', capture_manually: false },
    ],
  },
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

  it('signs and sends the request without asking for payment', async () => {
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
      payment_method_id: 'pm_default',
      preview_token: 'token-1',
      signature: { legal_name: 'Jane Customer', consent: true, content_sha256: preview.content_sha256 },
    });
    expect(ContractsService.bookingPreview).toHaveBeenCalledWith(expect.objectContaining({ event_id: 'event-1' }));
    expect(onBookingCreated).toHaveBeenCalledWith('booking-1');
    expect(await screen.findByText(/contract signed and request sent/i)).toBeInTheDocument();
    // customers pay only after the vendor accepts and signs
    expect(screen.queryByRole('button', { name: /pay now/i })).not.toBeInTheDocument();
    expect(BookingService.createCheckout).not.toHaveBeenCalled();
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

  it('shows the vendor price, service fee and total before signing', async () => {
    (ContractsService.bookingPreview as jest.Mock).mockResolvedValue({ data: { data: preview } });
    const user = userEvent.setup();
    render(<BookingModal listing={listing} onClose={onClose} />);
    await fillDetails(user);
    await user.click(screen.getByRole('button', { name: /review contract/i }));

    expect(await screen.findByText('$25.00')).toBeInTheDocument();
    expect(screen.getByText('$525.00')).toBeInTheDocument();
    expect(screen.getByText(/you pay after the vendor accepts and signs/i)).toBeInTheDocument();
    expect(screen.getByText(/50% deposit when the vendor accepts/i)).toBeInTheDocument();
    expect(screen.getByText('$275.00')).toBeInTheDocument();
  });

  describe('add-ons and per-unit packages', () => {
    const catering = {
      id: 'listing-2',
      title: 'Taco Catering',
      price: 45,
      price_unit: 'person',
      min_quantity: 50,
      max_quantity: 300,
      vendor: { id: 'vendor-2', name: 'Taco Co' },
      add_ons: [
        { id: 'ao-1', kind: 'ADD_ON', name: 'Bartender', description: 'Mixes drinks', price: 40, price_unit: 'PER_HOUR', price_text: '$40.00 per hour', max_quantity: null, in_library: true },
        { id: 'ao-2', kind: 'ADD_ON', name: 'Extra tray', description: null, price: 25, price_unit: 'PER_ITEM', price_text: '$25.00 each', max_quantity: 3, in_library: true },
      ],
      fees: [
        { id: 'fee-1', kind: 'FEE', name: 'Late return', description: null, price: 50, price_unit: 'PER_HOUR', price_text: '$50.00 per hour', max_quantity: null, in_library: true },
      ],
    } as any;

    const pricedPreview = {
      ...preview,
      pricing: {
        ...preview.pricing,
        price: 4575,
        service_fee: 228.75,
        total: 4803.75,
        schedule: [],
        package: { label: '$45.00 per person × 100 guests', unit: 'person', quantity: 100, unit_price: 45, amount: 4500 },
        add_ons: [{ add_on_id: 'ao-2', name: 'Extra tray', label: 'Extra tray × 3', quantity: 3, unit_price: 25, amount: 75 }],
      },
    };

    it('shows the per-person price, guest limits, add-ons and possible fees', () => {
      render(<BookingModal listing={catering} onClose={onClose} />);
      expect(screen.getByText('$45.00 / person')).toBeInTheDocument();
      expect(screen.getByText('This package is for 50–300 guests.')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /bartender/i })).toBeInTheDocument();
      expect(screen.getByText('$25.00 each')).toBeInTheDocument();
      expect(screen.getByText(/possible fees after the service/i)).toBeInTheDocument();
      expect(screen.getByText(/late return \(\$50\.00 per hour\)/i)).toBeInTheDocument();
    });

    it('needs a guest count within the package limits before pricing', async () => {
      const user = userEvent.setup();
      render(<BookingModal listing={catering} onClose={onClose} />);
      await user.type(screen.getByLabelText(/event date/i), '2030-06-01');
      await user.click(screen.getByRole('button', { name: /review contract/i }));
      expect(toast.error).toHaveBeenCalledWith('Enter how many guests are coming. This package is priced per person.');

      await user.type(screen.getByLabelText(/guest count/i), '20');
      await user.click(screen.getByRole('button', { name: /review contract/i }));
      expect(toast.error).toHaveBeenCalledWith('This package is for at least 50 guests.');
      expect(ContractsService.bookingPreview).not.toHaveBeenCalled();
    });

    it('needs an end time for an hourly package', async () => {
      const user = userEvent.setup();
      render(<BookingModal listing={{ ...listing, price_unit: 'hour' }} onClose={onClose} />);
      await user.type(screen.getByLabelText(/event date/i), '2030-06-01');
      await user.type(screen.getByLabelText(/start time/i), '18:00');
      await user.click(screen.getByRole('button', { name: /review contract/i }));
      expect(toast.error).toHaveBeenCalledWith('Add a start and end time. This package is priced by the hour.');
      expect(ContractsService.bookingPreview).not.toHaveBeenCalled();
    });

    it('sends the same picked add-ons with the preview and the booking, and shows the breakdown', async () => {
      (ContractsService.bookingPreview as jest.Mock).mockResolvedValue({ data: { data: pricedPreview } });
      (BookingService.create as jest.Mock).mockResolvedValue({ data: { success: true, data: { id: 'booking-2' } } });
      const user = userEvent.setup();
      render(<BookingModal listing={catering} onClose={onClose} />);
      await user.type(screen.getByLabelText(/event date/i), '2030-06-01');
      await user.type(screen.getByLabelText(/guest count/i), '100');
      await user.click(screen.getByRole('checkbox', { name: /extra tray/i }));
      const more = screen.getByRole('button', { name: /more extra tray/i });
      await user.click(more);
      await user.click(more);
      expect(more).toBeDisabled(); // max 3
      await user.click(screen.getByRole('button', { name: /review contract/i }));

      await waitFor(() => expect(ContractsService.bookingPreview).toHaveBeenCalled());
      const previewed = (ContractsService.bookingPreview as jest.Mock).mock.calls[0][0];
      expect(previewed.add_ons).toEqual([{ add_on_id: 'ao-2', quantity: 3 }]);
      expect(previewed.guest_count).toBe(100);

      expect(await screen.findByText('$45.00 per person × 100 guests')).toBeInTheDocument();
      expect(screen.getByText('$4500.00')).toBeInTheDocument();
      expect(screen.getByText('Extra tray × 3')).toBeInTheDocument();
      expect(screen.getByText('$75.00')).toBeInTheDocument();
      expect(screen.getByText('$4803.75')).toBeInTheDocument();

      await user.click(screen.getByLabelText(/sign electronically/i));
      await user.type(screen.getByLabelText(/full legal name/i), 'Jane Customer');
      await user.click(screen.getByRole('button', { name: /sign & send request/i }));
      await waitFor(() => expect(BookingService.create).toHaveBeenCalled());
      expect((BookingService.create as jest.Mock).mock.calls[0][0].add_ons).toEqual(previewed.add_ons);
    });

    it('shows the server message when pricing is refused', async () => {
      (ContractsService.bookingPreview as jest.Mock).mockRejectedValue({
        response: { status: 400, data: { message: 'One of the add-ons you picked is no longer offered. Please review your choices.' } },
      });
      const user = userEvent.setup();
      render(<BookingModal listing={catering} onClose={onClose} />);
      await user.type(screen.getByLabelText(/event date/i), '2030-06-01');
      await user.type(screen.getByLabelText(/guest count/i), '100');
      await user.click(screen.getByRole('checkbox', { name: /bartender/i }));
      await user.type(screen.getByLabelText(/start time/i), '18:00');
      await user.type(screen.getByLabelText(/end time/i), '22:00');
      await user.click(screen.getByRole('button', { name: /review contract/i }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('One of the add-ons you picked is no longer offered. Please review your choices.'),
      );
      expect((ContractsService.bookingPreview as jest.Mock).mock.calls[0][0].add_ons).toEqual([{ add_on_id: 'ao-1' }]);
    });
  });

  describe('vendor working hours', () => {
    const nineToFive = { open: '09:00', close: '17:00' };
    const hours = { mon: nineToFive, tue: nineToFive, wed: nineToFive, thu: nineToFive, fri: nineToFive, sat: { open: '10:00', close: '14:00' }, sun: null };
    const withHours = { ...listing, working_hours: hours };
    const options = (label: RegExp) => Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map((o) => o.value).filter(Boolean);

    it('shows when the vendor works', () => {
      render(<BookingModal listing={withHours} onClose={onClose} />);
      expect(screen.getByText('Works Mon–Fri 9am–5pm · Sat 10am–2pm')).toBeInTheDocument();
    });

    it("won't take a closed day", async () => {
      const user = userEvent.setup();
      render(<BookingModal listing={withHours} onClose={onClose} />);
      // Sunday, June 2 2030
      await user.type(screen.getByLabelText(/event date/i), '2030-06-02');
      await user.click(screen.getByText('DJ Service'));
      // the calendar refuses it, so the field is left empty and nothing is requested
      expect(screen.getByLabelText(/event date/i)).toHaveValue('');
      await user.click(screen.getByRole('button', { name: /review contract/i }));
      expect(ContractsService.bookingPreview).not.toHaveBeenCalled();
    });

    it('greys out closed days in the calendar', async () => {
      const user = userEvent.setup();
      render(<BookingModal listing={withHours} onClose={onClose} />);
      await user.type(screen.getByLabelText(/event date/i), '2030-06-01');
      // the calendar is open on June 2030: Sundays can't be picked, Saturdays can
      const day = (n: string) => document.querySelector(`.react-datepicker__day--0${n}:not(.react-datepicker__day--outside-month)`) as HTMLElement;
      expect(day('02').getAttribute('aria-disabled')).toBe('true');
      expect(day('09').getAttribute('aria-disabled')).toBe('true');
      expect(day('08').getAttribute('aria-disabled')).toBe('false');
      expect(day('03').getAttribute('aria-disabled')).toBe('false');
    });

    it("limits start and end times to the day's hours", async () => {
      (ContractsService.bookingPreview as jest.Mock).mockResolvedValue({ data: { data: preview } });
      const user = userEvent.setup();
      render(<BookingModal listing={withHours} onClose={onClose} />);
      // Saturday: 10am–2pm
      await user.type(screen.getByLabelText(/event date/i), '2030-06-01');
      await user.click(screen.getByText('DJ Service'));
      expect(screen.getByText('The vendor works 10am–2pm on Saturdays.')).toBeInTheDocument();
      expect(options(/start time/i)).toEqual(['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30']);
      expect(screen.getByLabelText(/end time/i)).toBeDisabled();

      await user.selectOptions(screen.getByLabelText(/start time/i), '12:00');
      expect(options(/end time/i)).toEqual(['12:30', '13:00', '13:30', '14:00']);
      await user.selectOptions(screen.getByLabelText(/end time/i), '14:00');

      await user.click(screen.getByRole('button', { name: /review contract/i }));
      await waitFor(() => expect(ContractsService.bookingPreview).toHaveBeenCalled());
      const sent = (ContractsService.bookingPreview as jest.Mock).mock.calls[0][0];
      expect(sent.event_start_at).toBe(new Date('2030-06-01T12:00').toISOString());
      expect(sent.event_end_at).toBe(new Date('2030-06-01T14:00').toISOString());
    });

    it('needs a start time when the vendor has hours', async () => {
      const user = userEvent.setup();
      render(<BookingModal listing={withHours} onClose={onClose} />);
      await user.type(screen.getByLabelText(/event date/i), '2030-06-03');
      await user.click(screen.getByText('DJ Service'));
      await user.click(screen.getByRole('button', { name: /review contract/i }));
      expect(toast.error).toHaveBeenCalledWith("Choose a start time within the vendor's hours");
      expect(ContractsService.bookingPreview).not.toHaveBeenCalled();
    });

    it('fits an hourly package inside the hours (fewest and most hours)', async () => {
      const user = userEvent.setup();
      render(<BookingModal listing={{ ...withHours, price_unit: 'hour', min_quantity: 2, max_quantity: 3 }} onClose={onClose} />);
      // Monday 9am–5pm, at least 2 hours: the last start is 3pm
      await user.type(screen.getByLabelText(/event date/i), '2030-06-03');
      await user.click(screen.getByText('DJ Service'));
      const starts = options(/start time/i);
      expect(starts[0]).toBe('09:00');
      expect(starts[starts.length - 1]).toBe('15:00');
      await user.selectOptions(screen.getByLabelText(/start time/i), '13:00');
      expect(options(/end time/i)).toEqual(['15:00', '15:30', '16:00']);
    });

    describe('in another time zone than the customer’s', () => {
      // this test's "device" is in UTC; the vendor saved their hours in Chicago (UTC−5 in June)
      const prevTz = process.env.TZ;
      beforeAll(() => {
        process.env.TZ = 'UTC';
      });
      afterAll(() => {
        process.env.TZ = prevTz;
      });
      const chicago = { ...listing, working_hours: { ...hours, timezone: 'America/Chicago' } };

      it('names the vendor’s zone and offers the customer’s times that fit it', async () => {
        (ContractsService.bookingPreview as jest.Mock).mockResolvedValue({ data: { data: preview } });
        const user = userEvent.setup();
        render(<BookingModal listing={chicago} onClose={onClose} />);
        expect(screen.getByText('Works Mon–Fri 9am–5pm · Sat 10am–2pm (Chicago time)')).toBeInTheDocument();
        // Saturday 10am–2pm in Chicago is 3pm–7pm here
        await user.type(screen.getByLabelText(/event date/i), '2030-06-01');
        await user.click(screen.getByText('DJ Service'));
        expect(screen.getByText('The vendor works 10am–2pm (Chicago time) on Saturdays.')).toBeInTheDocument();
        expect(options(/start time/i)).toEqual(['15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30']);
        await user.selectOptions(screen.getByLabelText(/start time/i), '18:00');
        expect(options(/end time/i)).toEqual(['18:30', '19:00']);
        await user.selectOptions(screen.getByLabelText(/end time/i), '19:00');
        await user.click(screen.getByRole('button', { name: /review contract/i }));
        await waitFor(() => expect(ContractsService.bookingPreview).toHaveBeenCalled());
        const sent = (ContractsService.bookingPreview as jest.Mock).mock.calls[0][0];
        expect(sent.event_start_at).toBe('2030-06-01T18:00:00.000Z');
        expect(sent.event_end_at).toBe('2030-06-01T19:00:00.000Z');
      });

      it('leaves the zone out when it is the customer’s own', () => {
        render(<BookingModal listing={{ ...listing, working_hours: { ...hours, timezone: 'UTC' } }} onClose={onClose} />);
        expect(screen.getByText('Works Mon–Fri 9am–5pm · Sat 10am–2pm')).toBeInTheDocument();
      });
    });

    it('keeps the plain date and time fields when no hours are set', () => {
      render(<BookingModal listing={listing} onClose={onClose} />);
      expect(screen.getByLabelText(/event date/i)).toHaveAttribute('type', 'date');
      expect(screen.getByLabelText(/start time/i)).toHaveAttribute('type', 'time');
      expect(screen.queryByText(/^Works /)).toBeNull();
    });
  });

  describe('minimum notice', () => {
    beforeAll(() => jest.useFakeTimers({ now: new Date('2030-06-01T12:00:00'), advanceTimers: true }));
    afterAll(() => jest.useRealTimers());
    const withNotice = { ...listing, min_notice_hours: 72 };

    it('says how far ahead to book and starts the date picker after the notice', () => {
      render(<BookingModal listing={withNotice} onClose={onClose} />);
      expect(screen.getByText('Book at least 3 days ahead')).toBeInTheDocument();
      expect(screen.getByLabelText(/event date/i)).toHaveAttribute('min', '2030-06-04');
    });

    it('refuses a start inside the notice before asking for the contract', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<BookingModal listing={withNotice} onClose={onClose} />);
      // June 4 at 9am is less than 72 hours after June 1 at noon
      await user.type(screen.getByLabelText(/event date/i), '2030-06-04');
      await user.type(screen.getByLabelText(/start time/i), '09:00');
      await user.click(screen.getByRole('button', { name: /review contract/i }));
      expect(toast.error).toHaveBeenCalledWith('This package needs to be booked at least 3 days ahead. Please pick a later date.');
      expect(ContractsService.bookingPreview).not.toHaveBeenCalled();
    });

    it('a quote from the vendor is not held to the notice', () => {
      render(<BookingModal listing={withNotice} quote={{ id: 'q1', title: 'Custom', amount: 400 }} onClose={onClose} />);
      expect(screen.queryByText('Book at least 3 days ahead')).toBeNull();
      expect(screen.getByLabelText(/event date/i)).toHaveAttribute('min', '2030-06-01');
    });
  });
});
