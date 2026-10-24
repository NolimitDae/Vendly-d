import { bookingStatusColor, bookingStatusLabel, cancelledByText } from './booking-status';

describe('bookingStatusLabel', () => {
  it('shows a missed deposit or balance instead of the status', () => {
    expect(bookingStatusLabel({ status: 'CONFIRMED', payment_state: 'pending_deposit' })).toBe('PENDING DEPOSIT');
    expect(bookingStatusLabel({ status: 'IN_PROGRESS', payment_state: 'pending_balance' })).toBe('PENDING BALANCE');
    expect(bookingStatusColor({ status: 'CONFIRMED', payment_state: 'pending_deposit' })).toContain('amber');
  });

  it('otherwise the status, with declined and expired requests told apart', () => {
    expect(bookingStatusLabel({ status: 'IN_PROGRESS' })).toBe('IN PROGRESS');
    expect(bookingStatusLabel({ status: 'REJECTED', expired_at: '2026-10-01' })).toBe('EXPIRED');
    expect(bookingStatusLabel({ status: 'REJECTED' })).toBe('DECLINED');
  });
});

describe('cancelledByText', () => {
  it('says who cancelled in the reader’s words', () => {
    expect(cancelledByText('VENDOR', 'CUSTOMER')).toBe('The vendor cancelled');
    expect(cancelledByText('VENDOR', 'VENDOR')).toBe('You cancelled');
    expect(cancelledByText('SYSTEM', 'VENDOR')).toBe("Cancelled by Vendly: the payment wasn't made in time");
    expect(cancelledByText(null, 'ADMIN')).toBeNull();
  });
});
