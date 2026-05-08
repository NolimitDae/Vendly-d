import React from 'react';
import { render, screen } from '@testing-library/react';
import ReviewCard, { Review } from './ReviewCard';

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}));

const baseReview: Review = {
  id: 'r1',
  rating: 4,
  comment: 'Great service!',
  created_at: '2024-03-15T10:00:00Z',
  author: { id: 'u1', name: 'Alice Smith', avatar_url: null },
};

describe('ReviewCard', () => {
  it('renders author name', () => {
    render(<ReviewCard review={baseReview} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('renders the review comment', () => {
    render(<ReviewCard review={baseReview} />);
    expect(screen.getByText('Great service!')).toBeInTheDocument();
  });

  it('renders formatted date', () => {
    render(<ReviewCard review={baseReview} />);
    // Date formatted as "Mar 15, 2024" or locale variant — just confirm something renders
    const dateEl = screen.getByText(/2024/);
    expect(dateEl).toBeInTheDocument();
  });

  it('shows initials avatar when no avatar_url', () => {
    render(<ReviewCard review={baseReview} />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('shows avatar image when avatar_url is provided', () => {
    const review: Review = {
      ...baseReview,
      author: { id: 'u1', name: 'Alice Smith', avatar_url: 'https://example.com/avatar.jpg' },
    };
    render(<ReviewCard review={review} />);
    const img = screen.getByRole('img', { name: 'Alice Smith' });
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
  });

  it('shows "Anonymous" and "A" initial when author is missing', () => {
    const review: Review = { ...baseReview, author: undefined };
    render(<ReviewCard review={review} />);
    expect(screen.getByText('Anonymous')).toBeInTheDocument();
    // initial = "Anonymous"[0].toUpperCase() = "A"
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders vendor reply when present', () => {
    const review: Review = { ...baseReview, reply: 'Thank you for your feedback!' };
    render(<ReviewCard review={review} />);
    expect(screen.getByText('Vendor reply')).toBeInTheDocument();
    expect(screen.getByText('Thank you for your feedback!')).toBeInTheDocument();
  });

  it('does not render vendor reply section when absent', () => {
    render(<ReviewCard review={baseReview} />);
    expect(screen.queryByText('Vendor reply')).not.toBeInTheDocument();
  });

  it('does not render comment paragraph when comment is absent', () => {
    const review: Review = { ...baseReview, comment: undefined };
    render(<ReviewCard review={review} />);
    expect(screen.queryByText('Great service!')).not.toBeInTheDocument();
  });
});
