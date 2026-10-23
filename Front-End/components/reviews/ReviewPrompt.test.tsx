import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReviewPrompt from './ReviewPrompt';

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/service/review/review.service', () => ({ ReviewService: { pending: jest.fn(), dismiss: jest.fn(), create: jest.fn() } }));
import { ReviewService } from '@/service/review/review.service';
import { toast } from 'react-toastify';

const pending = (over: any = {}) => ({
  booking_id: 'b1',
  completed_at: '2026-10-20T10:00:00Z',
  listing: { id: 'l1', title: 'Wedding DJ', image: null },
  vendor: { id: 'v1', name: 'Sam Sounds', avatar_url: null },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  (ReviewService.dismiss as jest.Mock).mockResolvedValue({});
});

describe('ReviewPrompt', () => {
  it('shows nothing when there is nothing to rate', async () => {
    (ReviewService.pending as jest.Mock).mockResolvedValue({ data: { data: [] } });
    const { container } = render(<ReviewPrompt />);
    await waitFor(() => expect(ReviewService.pending).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('rates with stars and an optional comment', async () => {
    (ReviewService.pending as jest.Mock).mockResolvedValue({ data: { data: [pending()] } });
    (ReviewService.create as jest.Mock).mockResolvedValue({ data: { success: true } });
    render(<ReviewPrompt />);
    expect(await screen.findByRole('heading', { name: 'How was Sam Sounds?' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send review' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '4 stars' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Your review' }), 'On time and great music');
    await userEvent.click(screen.getByRole('button', { name: 'Send review' }));
    expect(ReviewService.create).toHaveBeenCalledWith({ booking_id: 'b1', rating: 4, comment: 'On time and great music' });
    expect(toast.success).toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'How was Sam Sounds?' })).not.toBeInTheDocument();
  });

  it('"not now" stops asking and moves to the next booking', async () => {
    (ReviewService.pending as jest.Mock).mockResolvedValue({ data: { data: [pending(), pending({ booking_id: 'b2', vendor: { id: 'v2', name: 'Bloom', avatar_url: null } })] } });
    render(<ReviewPrompt />);
    await screen.findByRole('heading', { name: 'How was Sam Sounds?' });
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(ReviewService.dismiss).toHaveBeenCalledWith('b1');
    expect(screen.getByRole('heading', { name: 'How was Bloom?' })).toBeInTheDocument();
  });

  it('keeps the form when sending fails', async () => {
    (ReviewService.pending as jest.Mock).mockResolvedValue({ data: { data: [pending()] } });
    (ReviewService.create as jest.Mock).mockRejectedValue({ response: { data: { message: 'You already reviewed this booking' } } });
    render(<ReviewPrompt />);
    await screen.findByRole('heading', { name: 'How was Sam Sounds?' });
    await userEvent.click(screen.getByRole('button', { name: '5 stars' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send review' }));
    expect(toast.error).toHaveBeenCalledWith('You already reviewed this booking');
    expect(screen.getByRole('heading', { name: 'How was Sam Sounds?' })).toBeInTheDocument();
  });
});
