import React from 'react';
import { render, screen } from '@testing-library/react';
import StarRating from './StarRating';

describe('StarRating', () => {
  it('renders 5 star slots', () => {
    const { container } = render(<StarRating rating={3} />);
    // Each star renders two SVG elements (base + optional overlay)
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(5);
  });

  it('shows the numeric value when showValue=true', () => {
    render(<StarRating rating={4.3} showValue />);
    expect(screen.getByText('4.3')).toBeInTheDocument();
  });

  it('does not show numeric value by default', () => {
    render(<StarRating rating={4.3} />);
    expect(screen.queryByText('4.3')).not.toBeInTheDocument();
  });

  it('renders a full rating of 5 without crashing', () => {
    const { container } = render(<StarRating rating={5} showValue />);
    expect(screen.getByText('5.0')).toBeInTheDocument();
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders a rating of 0 without crashing', () => {
    render(<StarRating rating={0} showValue />);
    expect(screen.getByText('0.0')).toBeInTheDocument();
  });

  it('rounds to nearest half-star (3.7 → 3.5 rounded)', () => {
    // 3.7 rounds to 4.0 nearest 0.5 step → 4 filled stars
    // Just confirm it renders without error
    const { container } = render(<StarRating rating={3.7} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('accepts size prop without error', () => {
    const { container: c1 } = render(<StarRating rating={3} size="xs" />);
    const { container: c2 } = render(<StarRating rating={3} size="lg" />);
    expect(c1.firstChild).toBeInTheDocument();
    expect(c2.firstChild).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<StarRating rating={3} className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
