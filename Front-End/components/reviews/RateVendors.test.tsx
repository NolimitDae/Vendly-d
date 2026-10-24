import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RateVendors from './RateVendors';

jest.mock('next/image', () => ({ __esModule: true, default: ({ alt, src }: any) => <img alt={alt} src={src} /> }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/service/review/review.service', () => ({ ReviewService: { forEvent: jest.fn(), create: jest.fn() } }));
import { ReviewService } from '@/service/review/review.service';
import { toast } from 'react-toastify';

const item = (id: string, name: string, review: any = null) => ({
  booking_id: id,
  completed_at: '2026-11-15T10:00:00Z',
  listing: { id: `l-${id}`, title: 'Wedding package', category: 'Catering', image: null },
  vendor: { id: `v-${id}`, name, avatar_url: null },
  review,
});

const load = (items: any[]) =>
  (ReviewService.forEvent as jest.Mock).mockResolvedValue({
    data: { data: { event: { id: 'evt-1', name: 'Okafor wedding', status: 'COMPLETED' }, items, to_rate: items.filter((i) => !i.review).length } },
  });

beforeEach(() => jest.clearAllMocks());

describe('RateVendors', () => {
  it('lists every vendor on the event, showing the ones already reviewed', async () => {
    load([item('b1', 'Gourmet Bites', { id: 'r1', rating: 4, comment: 'Lovely food', created_at: '2026-11-16T10:00:00Z' }), item('b2', 'Royal Bloom')]);
    render(<RateVendors eventId="evt-1" />);

    expect(await screen.findByRole('heading', { name: 'Rate your vendors' })).toBeInTheDocument();
    expect(screen.getByText('Okafor wedding')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 rated')).toBeInTheDocument();

    const done = screen.getByRole('region', { name: 'Gourmet Bites' });
    expect(within(done).getByText('Reviewed')).toBeInTheDocument();
    expect(within(done).getByRole('img', { name: 'Rated 4 out of 5' })).toBeInTheDocument();
    expect(within(done).getByText('Lovely food')).toBeInTheDocument();
    expect(within(done).queryByRole('button', { name: 'Send review' })).toBeNull();

    const open = screen.getByRole('region', { name: 'Royal Bloom' });
    expect(within(open).getByRole('button', { name: 'Send review' })).toBeDisabled();
    expect(ReviewService.forEvent).toHaveBeenCalledWith('evt-1');
  });

  it('rates a vendor with stars and an optional review, then marks it done', async () => {
    load([item('b1', 'Gourmet Bites'), item('b2', 'Royal Bloom')]);
    (ReviewService.create as jest.Mock).mockResolvedValue({ data: { success: true, data: { id: 'r9', created_at: '2026-11-16T10:00:00Z' } } });
    render(<RateVendors eventId="evt-1" />);

    const card = await screen.findByRole('region', { name: 'Royal Bloom' });
    await userEvent.click(within(card).getByRole('button', { name: '5 stars' }));
    await userEvent.type(within(card).getByRole('textbox', { name: 'Your review of Royal Bloom' }), 'Beautiful flowers');
    await userEvent.click(within(card).getByRole('button', { name: 'Send review' }));

    expect(ReviewService.create).toHaveBeenCalledWith({ booking_id: 'b2', rating: 5, comment: 'Beautiful flowers' });
    expect(toast.success).toHaveBeenCalled();
    expect(within(card).getByText('Reviewed')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 rated')).toBeInTheDocument();
  });

  it('sends a rating without text and keeps the form if it fails', async () => {
    load([item('b1', 'Gourmet Bites')]);
    (ReviewService.create as jest.Mock).mockRejectedValue({ response: { data: { message: 'You already reviewed this booking' } } });
    render(<RateVendors eventId="evt-1" />);

    const card = await screen.findByRole('region', { name: 'Gourmet Bites' });
    await userEvent.click(within(card).getByRole('button', { name: '3 stars' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Send review' }));

    expect(ReviewService.create).toHaveBeenCalledWith({ booking_id: 'b1', rating: 3 });
    expect(toast.error).toHaveBeenCalledWith('You already reviewed this booking');
    expect(within(card).getByRole('button', { name: 'Send review' })).toBeInTheDocument();
  });

  it('explains when nothing is ready to rate', async () => {
    load([]);
    render(<RateVendors eventId="evt-1" />);
    expect(await screen.findByText(/Nothing to rate yet/)).toBeInTheDocument();
  });

  it('says so when every vendor is rated', async () => {
    load([item('b1', 'Gourmet Bites', { id: 'r1', rating: 5, comment: null, created_at: '2026-11-16T10:00:00Z' })]);
    render(<RateVendors eventId="evt-1" />);
    expect(await screen.findByText('All done. Thanks for rating everyone.')).toBeInTheDocument();
  });
});
