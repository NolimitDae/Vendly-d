import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportProblemForm from './ReportProblemForm';
import VendorDisputeCard from './VendorDisputeCard';

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/service/payments/payments.service', () => {
  const actual = jest.requireActual('@/service/payments/payments.service');
  return { ...actual, PaymentsService: { dispute: jest.fn() } };
});
jest.mock('@/service/booking/booking.service', () => ({ BookingService: { replyToDispute: jest.fn() } }));
import { PaymentsService } from '@/service/payments/payments.service';
import { toast } from 'react-toastify';

const jpg = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

beforeAll(() => {
  let n = 0;
  URL.createObjectURL = jest.fn(() => `blob:preview-${++n}`);
  URL.revokeObjectURL = jest.fn();
});

beforeEach(() => {
  jest.clearAllMocks();
  (PaymentsService.dispute as jest.Mock).mockResolvedValue({ data: { success: true } });
});

describe('ReportProblemForm', () => {
  it('sends the category, description, photos and a partial refund amount', async () => {
    const user = userEvent.setup();
    const onSent = jest.fn();
    render(<ReportProblemForm bookingId="b1" paid={400} onCancel={jest.fn()} onSent={onSent} />);
    const send = screen.getByRole('button', { name: /send report/i });
    expect(send).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('What went wrong?'), 'damage');
    await user.type(screen.getByLabelText('Tell us what happened'), 'The cake arrived smashed');
    await user.upload(screen.getByLabelText('Add photos'), [jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg')]);
    expect(screen.getAllByRole('img', { name: /photo \d/i })).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Remove photo 2' }));
    expect(screen.getAllByRole('img', { name: /photo \d/i })).toHaveLength(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-2');

    await user.click(screen.getByRole('radio', { name: 'Partial refund' }));
    await user.type(screen.getByLabelText(/amount \(up to \$400\.00\)/i), '450');
    expect(screen.getByText(/up to \$400\.00, what you’ve paid/)).toBeInTheDocument();
    expect(send).toBeDisabled();
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '120.5');
    await user.click(send);

    await waitFor(() => expect(onSent).toHaveBeenCalled());
    const [id, report] = (PaymentsService.dispute as jest.Mock).mock.calls[0];
    expect(id).toBe('b1');
    expect(report).toMatchObject({ reason: 'The cake arrived smashed', category: 'damage', outcome: 'partial_refund', requested_amount: 120.5 });
    expect(report.photos.map((f: File) => f.name)).toEqual(['a.jpg', 'c.jpg']);
  });

  it('asks for a full refund by default with no amount, and needs a category and 10 characters', async () => {
    const user = userEvent.setup();
    render(<ReportProblemForm bookingId="b1" paid={400} onCancel={jest.fn()} onSent={jest.fn()} />);
    await user.type(screen.getByLabelText('Tell us what happened'), 'Never showed up at all');
    expect(screen.getByRole('button', { name: /send report/i })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('What went wrong?'), 'no_show');
    expect(screen.getByRole('radio', { name: 'Full refund' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: /send report/i }));
    await waitFor(() => expect(PaymentsService.dispute).toHaveBeenCalled());
    const report = (PaymentsService.dispute as jest.Mock).mock.calls[0][1];
    expect(report).toMatchObject({ category: 'no_show', outcome: 'full_refund', requested_amount: undefined, photos: [] });
  });

  it('keeps to 10 photos', async () => {
    const user = userEvent.setup();
    render(<ReportProblemForm bookingId="b1" paid={400} onCancel={jest.fn()} onSent={jest.fn()} />);
    await user.upload(screen.getByLabelText('Add photos'), Array.from({ length: 12 }, (_, i) => jpg(`${i}.jpg`)));
    expect(screen.getAllByRole('img', { name: /photo \d+/i })).toHaveLength(10);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('up to 10 photos'));
    expect(screen.queryByRole('button', { name: /^add$/i })).not.toBeInTheDocument();
  });

  it('shows the server’s message when sending fails', async () => {
    (PaymentsService.dispute as jest.Mock).mockRejectedValue({ response: { data: { message: 'A dispute is already open.' } } });
    const user = userEvent.setup();
    render(<ReportProblemForm bookingId="b1" paid={400} onCancel={jest.fn()} onSent={jest.fn()} />);
    await user.selectOptions(screen.getByLabelText('What went wrong?'), 'quality');
    await user.type(screen.getByLabelText('Tell us what happened'), 'The photos were blurry');
    await user.click(screen.getByRole('button', { name: /send report/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('A dispute is already open.'));
  });
});

describe('VendorDisputeCard', () => {
  it('shows the vendor the kind of problem, what is asked for and the photos', () => {
    render(
      <VendorDisputeCard
        bookingId="b1"
        booking={{
          dispute_opened_at: '2026-10-20T10:00:00Z',
          dispute_reason: 'The DJ arrived two hours late',
          dispute_category: 'late',
          dispute_outcome: 'partial_refund',
          dispute_requested_amount: '75.00',
          dispute_photo_urls: ['https://api.test/api/dispute-files/t1'],
        }}
      />,
    );
    expect(screen.getByText('Vendor was late')).toBeInTheDocument();
    expect(screen.getByText('Partial refund of $75.00')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Photo 1 of 1' }).closest('a')).toHaveAttribute('href', 'https://api.test/api/dispute-files/t1');
  });
});
