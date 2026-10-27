import React, { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import PaymentPlanCard, { type PaymentPlanState } from './PaymentPlanCard';
import PaymentPlanEditor from './PaymentPlanEditor';
import { addRow, evenRows, paymentStatusText, planError, planPayload, remainder, splitEvenly, startingPlan, type PlanDraftRow } from '@/lib/payment-plan';

jest.mock('@/service/booking/booking.service', () => ({
  BookingService: { paymentPlan: jest.fn(), approvePaymentPlan: jest.fn(), declinePaymentPlan: jest.fn(), previewPaymentPlan: jest.fn(), proposePaymentPlan: jest.fn(), withdrawPaymentPlan: jest.fn() },
}));
jest.mock('@/service/contracts/contracts.service', () => ({
  ContractsService: { get: jest.fn(), vendorList: jest.fn(), downloadLink: jest.fn() },
  apiError: (_e: unknown, fallback: string) => fallback,
}));
// the signing panel itself is tested on its own; here it just signs
jest.mock('@/components/contracts/SignContractPanel', () => ({
  __esModule: true,
  default: ({ submitLabel, onSubmit, contentSha256 }: any) => (
    <button type="button" onClick={() => onSubmit({ legal_name: 'Cara Customer', consent: true, content_sha256: contentSha256, signature_image: 'data:image/png;base64,x' })}>
      {submitLabel}
    </button>
  ),
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import { BookingService } from '@/service/booking/booking.service';
import { ContractsService } from '@/service/contracts/contracts.service';

const inDays = (d: number) => dayjs().add(d, 'day').format('YYYY-MM-DD');
const row = (amount: string, date = ''): PlanDraftRow => ({ key: `${amount}-${date}`, amount, date });

describe('payment plan helpers', () => {
  it('splits evenly, the leftover cents on the first payment', () => {
    expect(splitEvenly(100, 3)).toEqual([33.34, 33.33, 33.33]);
    const rows = evenRows([row('1'), row('1'), row('1')], 1000, dayjs().add(30, 'day').toISOString());
    expect(rows.map((r) => r.amount)).toEqual(['333.34', '333.33', '333.33']);
    // empty dates are filled in, the first stays "when accepted"
    expect(rows[0].date).toBe('');
    expect(rows[1].date < rows[2].date).toBe(true);
  });

  it('keeps a running remainder, and a new payment takes what is left', () => {
    const rows = [row('400'), row('300', inDays(10))];
    expect(remainder(rows, 1000)).toBe(300);
    const more = addRow(rows, 1000);
    expect(more).toHaveLength(3);
    expect(more[2]).toMatchObject({ amount: '300.00', date: inDays(17) });
    expect(remainder(more, 1000)).toBe(0);
  });

  it('checks the plan as the server does', () => {
    const opts = { feeOwed: 50, latest: dayjs().add(40, 'day').toISOString() };
    expect(planError([row('1000')], 1000, opts)).toMatch(/2 to 12 payments/);
    expect(planError([row('80'), row('920', inDays(5))], 1000, opts)).toMatch(/fee of \$50\.00, so it must be at least \$100\.00/);
    expect(planError([row('500'), row('40', inDays(5)), row('460', inDays(9))], 1000, opts)).toMatch(/Payment 2 must be at least \$50\.00/);
    expect(planError([row('500'), row('500')], 1000, opts)).toMatch(/Pick a date for payment 2/);
    expect(planError([row('500'), row('500', inDays(9)), row('0.5', inDays(9))], 1000.5, opts)).toMatch(/Payment 3 must be due after payment 2/);
    expect(planError([row('500'), row('500', inDays(50))], 1000, opts)).toMatch(/can be due up to/);
    expect(planError([row('500'), row('400', inDays(9))], 1000, opts)).toBe('$100.00 still to place. The payments must add up to $1,000.00.');
    expect(planError([row('500'), row('500', inDays(9))], 1000, opts)).toBeNull();
  });

  it('sends dates at 9 AM, never after the event start on the event day', () => {
    const start = dayjs(`${inDays(20)}T08:00`).toISOString();
    const body = planPayload([row('500'), row('300', inDays(10)), row('200', inDays(20))], start);
    expect(body.payments[0]).toEqual({ amount: 500 });
    expect(dayjs(body.payments[1].due_at).format('YYYY-MM-DD HH:mm')).toBe(`${inDays(10)} 09:00`);
    expect(body.payments[2].due_at).toBe(start);
  });

  it('words every status, including ones it doesn’t know', () => {
    expect(['SCHEDULED', 'PAID', 'FAILED', 'PROCESSING', null].map(paymentStatusText)).toEqual(['Scheduled', 'Paid', 'Failed, pay now', 'Processing', 'Proposed']);
    expect(paymentStatusText('ACH_PENDING')).toBe('Ach pending');
  });

  it('starts with two equal payments, the second a week before the event', () => {
    const rows = startingPlan(1000, dayjs().add(30, 'day').toISOString());
    expect(rows.map((r) => r.amount)).toEqual(['500.00', '500.00']);
    expect(rows[1].date).toBe(inDays(23));
  });
});

describe('PaymentPlanEditor', () => {
  function Harness() {
    const [rows, setRows] = useState<PlanDraftRow[]>([row('600'), row('100', inDays(5))]);
    return <PaymentPlanEditor rows={rows} onChange={setRows} total={1000} feeOwed={50} firstLabel="When you accept" />;
  }

  it('shows what is left, splits evenly and adds payments', async () => {
    render(<Harness />);
    expect(screen.getByRole('status')).toHaveTextContent('$300.00 left to place of $1,000.00');
    await userEvent.click(screen.getByRole('button', { name: 'Split evenly' }));
    expect(screen.getByLabelText('Amount of payment 1')).toHaveValue(500);
    expect(screen.getByRole('status')).toHaveTextContent('Adds up to $1,000.00');
    await userEvent.click(screen.getByRole('button', { name: /Add payment/ }));
    expect(screen.getByLabelText('Amount of payment 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove payment 3' }));
    expect(screen.queryByLabelText('Amount of payment 3')).toBeNull();
    expect(screen.getByText(/includes the Vendly Protection fee of \$50\.00/)).toBeInTheDocument();
  });
});

const waiting = (over: Partial<PaymentPlanState> = {}): PaymentPlanState => ({
  role: 'CUSTOMER',
  plan: 'DEPOSIT_50',
  payments: [
    { label: '50% deposit', amount: 2100, due_at: '2026-10-20T12:00:00Z', status: 'PAID' },
    { label: 'Balance', amount: 2000, due_at: '2026-12-01T12:00:00Z', status: 'SCHEDULED' },
  ],
  can_propose: false,
  cannot_propose_reason: null,
  rules: null,
  proposal: {
    contract_id: 'c3',
    status: 'WAITING',
    sent_at: '2026-10-27T12:00:00Z',
    vendor_name: 'Gala Caterers',
    note: 'Half now, half later.',
    owed: 2000,
    before: [
      { label: '50% deposit', amount: 2100, due_at: '2026-10-20T12:00:00Z', status: 'PAID' },
      { label: 'Balance', amount: 2000, due_at: '2026-12-01T12:00:00Z', status: 'SCHEDULED' },
    ],
    after: [
      { label: 'Payment 2 of 3', amount: 1000, due_at: null, status: null },
      { label: 'Payment 3 of 3', amount: 1000, due_at: '2026-11-20T15:00:00Z', status: null },
    ],
    content_sha256: 'h'.repeat(64),
  },
  consent_text: 'I agree',
  ...over,
});

describe('PaymentPlanCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('the customer sees the plan before and after, and signs to agree', async () => {
    (BookingService.paymentPlan as jest.Mock).mockResolvedValue({ data: { data: waiting() } });
    (ContractsService.get as jest.Mock).mockResolvedValue({ data: { data: { title: 'Amendment', body: 'Body', content_sha256: 'h'.repeat(64), consent_text: 'I agree', has_source_pdf: false } } });
    (BookingService.approvePaymentPlan as jest.Mock).mockResolvedValue({ data: { success: true } });
    render(<PaymentPlanCard bookingId="b1" role="CUSTOMER" bookingStatus="CONFIRMED" otherName="Gala Caterers" />);
    expect(await screen.findByRole('heading', { name: 'Gala Caterers proposed a payment plan' })).toBeInTheDocument();
    expect(screen.getByText('Half now, half later.')).toBeInTheDocument();
    const now = screen.getByRole('list', { name: 'Current payments' });
    expect(within(now).getByText('Balance')).toBeInTheDocument();
    const next = screen.getByRole('list', { name: 'Payments with the new plan' });
    // the paid deposit stays, the balance becomes two payments
    expect(within(next).getByText('50% deposit')).toBeInTheDocument();
    expect(within(next).queryByText('Balance')).toBeNull();
    expect(within(next).getByText(/When you agree/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Review and sign' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sign and agree' }));
    await waitFor(() => expect(BookingService.approvePaymentPlan).toHaveBeenCalledWith('b1', expect.objectContaining({ content_sha256: 'h'.repeat(64) })));
  });

  it('the customer can decline; the payments stay', async () => {
    (BookingService.paymentPlan as jest.Mock).mockResolvedValue({ data: { data: waiting() } });
    (BookingService.declinePaymentPlan as jest.Mock).mockResolvedValue({ data: { success: true } });
    jest.spyOn(window, 'prompt').mockReturnValue('Not now');
    render(<PaymentPlanCard bookingId="b1" role="CUSTOMER" bookingStatus="CONFIRMED" otherName="Gala Caterers" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Decline plan' }));
    await waitFor(() => expect(BookingService.declinePaymentPlan).toHaveBeenCalledWith('b1', 'Not now'));
  });

  it('the vendor sees each payment’s status and can propose a plan for what is left', async () => {
    (BookingService.paymentPlan as jest.Mock).mockResolvedValue({
      data: {
        data: waiting({
          role: 'VENDOR',
          proposal: null,
          can_propose: true,
          payments: [
            { label: '50% deposit', amount: 2100, due_at: '2026-10-20T12:00:00Z', status: 'PAID' },
            { label: 'Balance', amount: 2000, due_at: '2026-12-01T12:00:00Z', status: 'FAILED' },
          ],
          rules: { owed: 2000, fee_owed: 0, paid_count: 1, min_payments: 2, max_payments: 12, min_payment: 50, latest_due_at: dayjs().add(40, 'day').toISOString(), event_start_at: dayjs().add(40, 'day').toISOString(), pay_after: false },
        }),
      },
    });
    (BookingService.previewPaymentPlan as jest.Mock).mockResolvedValue({ data: { data: { title: 'Amendment', body: 'Body', content_sha256: 'v'.repeat(64), consent_text: 'I agree', missing_message: null } } });
    (ContractsService.vendorList as jest.Mock).mockResolvedValue({ data: { data: { has_saved_signature: false } } });
    (BookingService.proposePaymentPlan as jest.Mock).mockResolvedValue({ data: { success: true } });
    render(<PaymentPlanCard bookingId="b1" role="VENDOR" bookingStatus="CONFIRMED" otherName="Cara" />);
    const list = await screen.findByRole('list', { name: 'Payments on this booking' });
    expect(within(list).getByText(/Paid/)).toBeInTheDocument();
    expect(within(list).getByText(/Failed, pay now/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Propose a payment plan' }));
    expect(screen.getByRole('status')).toHaveTextContent('Adds up to $2,000.00');
    await userEvent.click(screen.getByRole('button', { name: 'Review and sign' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sign and send' }));
    await waitFor(() => expect(BookingService.proposePaymentPlan).toHaveBeenCalled());
    const [, body] = (BookingService.proposePaymentPlan as jest.Mock).mock.calls[0];
    expect(body.payments).toHaveLength(2);
    expect(body.payments[0]).toEqual({ amount: 1000 });
  });

  it('shows nothing on a request (changes go through Suggest changes)', () => {
    const { container } = render(<PaymentPlanCard bookingId="b1" role="VENDOR" bookingStatus="PENDING" otherName="Cara" />);
    expect(container).toBeEmptyDOMElement();
    expect(BookingService.paymentPlan).not.toHaveBeenCalled();
  });
});
