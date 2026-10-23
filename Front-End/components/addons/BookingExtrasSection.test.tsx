import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookingExtrasSection from './BookingExtrasSection';

jest.mock('@/service/add-ons/add-ons.service', () => ({
  AddOnsService: { list: jest.fn() },
  BookingExtrasService: {
    list: jest.fn(),
    request: jest.fn(),
    withdraw: jest.fn(),
    escalate: jest.fn(),
    giveBack: jest.fn(),
    approve: jest.fn(),
    decline: jest.fn(),
  },
}));

jest.mock('@/service/payments/payments.service', () => ({
  PaymentsService: { retry: jest.fn() },
}));

jest.mock('@/components/payments/SavedCards', () => ({
  __esModule: true,
  default: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <button type="button" onClick={() => onSelect('pm_other')}>Mastercard •••• 4444</button>
  ),
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { AddOnsService, BookingExtrasService } from '@/service/add-ons/add-ons.service';
import { PaymentsService } from '@/service/payments/payments.service';
import { toast } from 'react-toastify';

const base = {
  description: null,
  unit_price: 40,
  price_unit: 'PER_HOUR',
  quantity: 2,
  amount: 80,
  fee_amount: 4,
  total: 84,
  note: 'You asked us to stay longer',
  created_at: '2030-06-01T20:00:00Z',
  responded_at: null,
  decline_reason: null,
  review_requested_at: null,
  review_note: null,
  reviewed_at: null,
  can_escalate_at: null,
  payment: null,
};

const pendingAddOn = { ...base, id: 'ex-1', kind: 'ADD_ON', name: 'Bartender', label: 'Bartender: $40.00 × 2 hours', status: 'PENDING' };
const included = { ...base, id: 'ex-0', kind: 'ADD_ON', name: 'Dessert table', label: 'Dessert table: $5.00 × 100 guests', amount: 500, fee_amount: 0, total: 500, note: null, status: 'INCLUDED' };
const declinedFee = {
  ...base,
  id: 'ex-2',
  kind: 'FEE',
  name: 'Late return',
  label: 'Late return: $50.00 × 2 hours',
  amount: 100,
  fee_amount: 0,
  total: 100,
  note: 'Chairs came back 2 hours late',
  status: 'DECLINED',
  decline_reason: 'They were on time',
};
const failedFee = {
  ...declinedFee,
  id: 'ex-3',
  status: 'APPROVED',
  decline_reason: null,
  payment: { installment_id: 'inst-9', status: 'FAILED', paid_at: null, last_error: 'Your card was declined.', refunded_amount: 0 },
};

function mockList(data: any[], can_request = { add_on: true, fee: true }) {
  (BookingExtrasService.list as jest.Mock).mockResolvedValue({
    data: {
      success: true,
      data,
      meta: { waiting_on_customer: data.filter((d) => d.status === 'PENDING').length, waiting_total: 84, can_request },
    },
  });
}

describe('BookingExtrasSection (customer)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('shows nothing when the booking has no add-ons or fees', async () => {
    mockList([]);
    const { container } = render(<BookingExtrasSection bookingId="b1" role="CUSTOMER" />);
    await waitFor(() => expect(BookingExtrasService.list).toHaveBeenCalledWith('b1'));
    expect(container).toBeEmptyDOMElement();
  });

  it('lists included add-ons and requests with their status', async () => {
    mockList([included, pendingAddOn, declinedFee]);
    render(<BookingExtrasSection bookingId="b1" role="CUSTOMER" />);
    expect(await screen.findByText('Included add-ons')).toBeInTheDocument();
    expect(screen.getByText('Dessert table: $5.00 × 100 guests')).toBeInTheDocument();
    expect(screen.getByText('Needs your approval')).toBeInTheDocument();
    expect(screen.getByText('$80.00 + $4.00 Vendly Protection fee')).toBeInTheDocument();
    expect(screen.getByText('Declined')).toBeInTheDocument();
    expect(screen.getByText(/1 request needs your approval/i)).toBeInTheDocument();
  });

  it('approves a request and charges the card on the booking', async () => {
    mockList([pendingAddOn]);
    (BookingExtrasService.approve as jest.Mock).mockResolvedValue({ data: { success: true, data: { ...pendingAddOn, status: 'APPROVED', paid: true } } });
    const onChanged = jest.fn();
    const user = userEvent.setup();
    render(<BookingExtrasSection bookingId="b1" role="CUSTOMER" onChanged={onChanged} />);
    await user.click(await screen.findByRole('button', { name: 'Approve and pay $84.00' }));
    await waitFor(() => expect(BookingExtrasService.approve).toHaveBeenCalledWith('ex-1', undefined));
    expect(toast.success).toHaveBeenCalledWith('Approved and paid');
    expect(onChanged).toHaveBeenCalled();
  });

  it('approves with another saved card', async () => {
    mockList([pendingAddOn]);
    (BookingExtrasService.approve as jest.Mock).mockResolvedValue({ data: { success: true, data: { ...pendingAddOn, paid: true } } });
    const user = userEvent.setup();
    render(<BookingExtrasSection bookingId="b1" role="CUSTOMER" />);
    await user.click(await screen.findByRole('button', { name: /use another card/i }));
    await user.click(screen.getByRole('button', { name: /mastercard/i }));
    await user.click(screen.getByRole('button', { name: /with this card/i }));
    await waitFor(() => expect(BookingExtrasService.approve).toHaveBeenCalledWith('ex-1', 'pm_other'));
  });

  it('says so when the approved payment did not go through', async () => {
    mockList([pendingAddOn]);
    (BookingExtrasService.approve as jest.Mock).mockResolvedValue({
      data: { success: true, data: { ...pendingAddOn, paid: false, payment: { last_error: 'Your card was declined.' } } },
    });
    const user = userEvent.setup();
    render(<BookingExtrasSection bookingId="b1" role="CUSTOMER" />);
    await user.click(await screen.findByRole('button', { name: 'Approve and pay $84.00' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Approved, but the payment didn't go through: Your card was declined."));
  });

  it('declines with an optional reason', async () => {
    mockList([pendingAddOn]);
    (BookingExtrasService.decline as jest.Mock).mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    render(<BookingExtrasSection bookingId="b1" role="CUSTOMER" />);
    await user.click(await screen.findByRole('button', { name: 'Decline' }));
    await user.type(screen.getByLabelText(/reason/i), 'We did not ask for this');
    await user.click(screen.getByRole('button', { name: 'Decline add-on' }));
    await waitFor(() => expect(BookingExtrasService.decline).toHaveBeenCalledWith('ex-1', 'We did not ask for this'));
  });

  it('shows the server message when approving fails', async () => {
    mockList([pendingAddOn]);
    (BookingExtrasService.approve as jest.Mock).mockRejectedValue({ response: { status: 400, data: { message: 'This request was withdrawn.' } } });
    const user = userEvent.setup();
    render(<BookingExtrasSection bookingId="b1" role="CUSTOMER" />);
    await user.click(await screen.findByRole('button', { name: 'Approve and pay $84.00' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This request was withdrawn.'));
  });

  it('retries a failed payment', async () => {
    mockList([failedFee]);
    (PaymentsService.retry as jest.Mock).mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    render(<BookingExtrasSection bookingId="b1" role="CUSTOMER" />);
    expect(await screen.findByText('Payment problem')).toBeInTheDocument();
    expect(screen.getByText('Your card was declined.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry payment/i }));
    await waitFor(() => expect(PaymentsService.retry).toHaveBeenCalledWith('b1', 'inst-9', undefined));
  });
});

describe('BookingExtrasSection (vendor)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    (AddOnsService.list as jest.Mock).mockResolvedValue({
      data: { data: [{ id: 'lib-1', kind: 'FEE', name: 'Late return', price: 50, price_unit: 'PER_HOUR', price_text: '$50.00 per hour', description: null, max_quantity: null, in_library: true }] },
    });
  });

  it('only lets fees be requested once the job has started', async () => {
    mockList([], { add_on: true, fee: false });
    render(<BookingExtrasSection bookingId="b1" role="VENDOR" bookingStatus="CONFIRMED" />);
    expect(await screen.findByRole('button', { name: /request a fee/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /add an add-on/i })).toBeEnabled();
  });

  it('sends a fee from the library with a reason', async () => {
    mockList([]);
    (BookingExtrasService.request as jest.Mock).mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    render(<BookingExtrasSection bookingId="b1" role="VENDOR" bookingStatus="COMPLETED" />);
    await user.click(await screen.findByRole('button', { name: /request a fee/i }));
    await user.selectOptions(await screen.findByLabelText(/from your library/i), 'lib-1');
    await user.type(screen.getByLabelText(/hours/i), '2');
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/reason the customer will see/i), 'Chairs came back 2 hours late');
    await user.click(screen.getByRole('button', { name: /send for approval/i }));
    await waitFor(() =>
      expect(BookingExtrasService.request).toHaveBeenCalledWith('b1', {
        kind: 'FEE',
        add_on_id: 'lib-1',
        name: 'Late return',
        unit_price: 50,
        price_unit: 'PER_HOUR',
        quantity: 2,
        note: 'Chairs came back 2 hours late',
      }),
    );
  });

  it('asks Vendly to review a declined fee', async () => {
    mockList([declinedFee]);
    (BookingExtrasService.escalate as jest.Mock).mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    render(<BookingExtrasSection bookingId="b1" role="VENDOR" bookingStatus="COMPLETED" />);
    expect(await screen.findByText('They were on time')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /ask vendly to review/i }));
    const send = screen.getByRole('button', { name: /send to vendly/i });
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText(/what happened/i), 'Photos show the chairs at 9pm, contract says 7pm.');
    await user.click(send);
    await waitFor(() => expect(BookingExtrasService.escalate).toHaveBeenCalledWith('ex-2', 'Photos show the chairs at 9pm, contract says 7pm.'));
  });

  it('gives money back and shows how it was returned', async () => {
    mockList([]);
    (BookingExtrasService.giveBack as jest.Mock).mockResolvedValue({
      data: { success: true, data: { amount: 50, lowered: 20, refunded: 30, recovered_from_balance: 0 } },
    });
    const user = userEvent.setup();
    render(<BookingExtrasSection bookingId="b1" role="VENDOR" bookingStatus="COMPLETED" />);
    await user.click(await screen.findByRole('button', { name: /give money back/i }));
    await user.type(screen.getByLabelText('Amount'), '50');
    await user.type(screen.getByLabelText(/reason the customer will see/i), 'Started late');
    const buttons = screen.getAllByRole('button', { name: /give money back/i });
    await user.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(BookingExtrasService.giveBack).toHaveBeenCalledWith('b1', 50, 'Started late'));
    expect(window.confirm).toHaveBeenCalled();
    expect(await screen.findByText('$20.00 came off what the customer still owes.')).toBeInTheDocument();
    expect(screen.getByText('$30.00 was refunded to their card.')).toBeInTheDocument();
  });
});
