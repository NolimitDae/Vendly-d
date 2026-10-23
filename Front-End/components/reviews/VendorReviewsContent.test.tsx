import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VendorReviewsContent from './VendorReviewsContent';

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/service/review/review.service', () => ({ ReviewService: { mine: jest.fn(), reply: jest.fn() } }));
import { ReviewService } from '@/service/review/review.service';
import { toast } from 'react-toastify';

const review = (over: any = {}) => ({
  id: 'r1',
  rating: 5,
  comment: 'Amazing food, everyone loved it',
  reply: null,
  created_at: '2026-10-12T10:00:00Z',
  author: { id: 'c1', name: 'Amara', avatar_url: 'https://cdn.test/a.png' },
  listing: { id: 'l1', title: 'Wedding buffet' },
  ...over,
});

const page = (data: any[], meta: any = {}) => ({ data: { success: true, data, meta: { total: data.length, page: 1, limit: 20, last_page: 1, avg_rating: 4.5, unanswered: 1, ...meta } } });

beforeEach(() => jest.clearAllMocks());

describe('VendorReviewsContent', () => {
  it('shows the average, the count and each review with its customer, package and date', async () => {
    (ReviewService.mine as jest.Mock).mockResolvedValue(page([review(), review({ id: 'r2', rating: 4, comment: null, reply: 'Thank you!', author: { id: 'c2', name: 'Ben', avatar_url: null } })], { total: 2 }));
    render(<VendorReviewsContent />);
    expect(await screen.findByText('Amazing food, everyone loved it')).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('2 reviews')).toBeInTheDocument();
    expect(screen.getByText('1 waiting for your reply')).toBeInTheDocument();
    expect(screen.getByText('Amara')).toBeInTheDocument();
    expect(screen.getAllByText(/Wedding buffet/)).toHaveLength(2);
    expect(screen.getAllByText('Oct 12, 2026')).toHaveLength(2);
    expect(screen.getByRole('img', { name: '5 out of 5 stars' })).toBeInTheDocument();
    // already answered: shown, and no second reply
    expect(screen.getByText('Thank you!')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^reply$/i })).toHaveLength(1);
  });

  it('replies once and shows the reply', async () => {
    (ReviewService.mine as jest.Mock).mockResolvedValue(page([review()]));
    (ReviewService.reply as jest.Mock).mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    render(<VendorReviewsContent />);
    await user.click(await screen.findByRole('button', { name: /^reply$/i }));
    await user.type(screen.getByLabelText('Reply to Amara'), '  So glad you enjoyed it!  ');
    await user.click(screen.getByRole('button', { name: 'Post reply' }));
    await waitFor(() => expect(ReviewService.reply).toHaveBeenCalledWith('r1', 'So glad you enjoyed it!'));
    const card = screen.getByText('Your reply').closest('li')!;
    expect(within(card).getByText('So glad you enjoyed it!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reply$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/waiting for your reply/)).not.toBeInTheDocument();
  });

  it('shows the server’s message when a reply fails', async () => {
    (ReviewService.mine as jest.Mock).mockResolvedValue(page([review()]));
    (ReviewService.reply as jest.Mock).mockRejectedValue({ response: { data: { message: 'You already replied to this review' } } });
    const user = userEvent.setup();
    render(<VendorReviewsContent />);
    await user.click(await screen.findByRole('button', { name: /^reply$/i }));
    await user.type(screen.getByLabelText('Reply to Amara'), 'Thanks');
    await user.click(screen.getByRole('button', { name: 'Post reply' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('You already replied to this review'));
  });

  it('has an empty state', async () => {
    (ReviewService.mine as jest.Mock).mockResolvedValue(page([], { total: 0, avg_rating: null, unanswered: 0 }));
    render(<VendorReviewsContent />);
    expect(await screen.findByText('No reviews yet')).toBeInTheDocument();
  });

  it('loads more pages', async () => {
    (ReviewService.mine as jest.Mock)
      .mockResolvedValueOnce(page([review()], { total: 2, last_page: 2 }))
      .mockResolvedValueOnce(page([review({ id: 'r2', comment: 'Second page review' })], { total: 2, page: 2, last_page: 2 }));
    const user = userEvent.setup();
    render(<VendorReviewsContent />);
    await user.click(await screen.findByRole('button', { name: /show more/i }));
    expect(await screen.findByText('Second page review')).toBeInTheDocument();
    expect(ReviewService.mine).toHaveBeenLastCalledWith({ page: 2, limit: 20 });
    expect(screen.getByText('Amazing food, everyone loved it')).toBeInTheDocument();
  });
});
