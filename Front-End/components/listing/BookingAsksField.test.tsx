import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import BookingAsksField from './BookingAsksField';

const base = { customerCanCome: false, onCustomerCanCome: jest.fn(), guestRequired: null, onGuestRequired: jest.fn(), isVenue: false, priceUnit: 'fixed' };

describe('BookingAsksField', () => {
  afterEach(() => jest.clearAllMocks());

  it('offers "customers can come to me" only when the vendor goes to the customer', () => {
    const { rerender } = render(<BookingAsksField {...base} serviceAt="CUSTOMER_LOCATION" />);
    fireEvent.click(screen.getByLabelText(/Customers can come to me instead/));
    expect(base.onCustomerCanCome).toHaveBeenCalledWith(true);
    rerender(<BookingAsksField {...base} serviceAt="VENDOR_LOCATION" />);
    expect(screen.queryByLabelText(/Customers can come to me instead/)).not.toBeInTheDocument();
    rerender(<BookingAsksField {...base} serviceAt="CUSTOMER_LOCATION" isVenue />);
    expect(screen.queryByLabelText(/Customers can come to me instead/)).not.toBeInTheDocument();
  });

  it('shows the guest count default (required for venues) until the vendor picks', () => {
    const { rerender } = render(<BookingAsksField {...base} serviceAt="CUSTOMER_LOCATION" />);
    expect(screen.getByRole('button', { name: 'Optional' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Required' }));
    expect(base.onGuestRequired).toHaveBeenCalledWith(true);
    rerender(<BookingAsksField {...base} serviceAt="CUSTOMER_LOCATION" isVenue />);
    expect(screen.getByRole('button', { name: 'Required' })).toHaveAttribute('aria-pressed', 'true');
    rerender(<BookingAsksField {...base} serviceAt="CUSTOMER_LOCATION" isVenue guestRequired={false} />);
    expect(screen.getByRole('button', { name: 'Optional' })).toHaveAttribute('aria-pressed', 'true');
    // per person: the guests are the quantity
    rerender(<BookingAsksField {...base} serviceAt="CUSTOMER_LOCATION" priceUnit="person" />);
    expect(screen.queryByRole('button', { name: 'Required' })).not.toBeInTheDocument();
  });
});
