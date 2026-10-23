import React from 'react';
import { render, screen } from '@testing-library/react';
import PrivacyPolicyPage from './page';

describe('Admin platform policies page', () => {
  it('hides the select that saves nothing and the rules Vendly does not enforce', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.queryByText('Max message length (characters)')).not.toBeInTheDocument();
    expect(screen.queryByText('Consecutive failed payments before cancelled')).not.toBeInTheDocument();
    expect(screen.queryByText('No Messaging Before Payment')).not.toBeInTheDocument();
    expect(screen.queryByText('No Address Sharing Before Deposit')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancellation Policy')).not.toBeInTheDocument();
  });

  it('keeps the accurate descriptions', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByText('Require Booking Completion')).toBeInTheDocument();
    expect(screen.getByText('Allow Vendor Responses')).toBeInTheDocument();
    expect(screen.getByText('Allow File Sharing')).toBeInTheDocument();
  });
});
