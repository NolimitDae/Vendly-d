import { cancelReasonLabel, cancelReasonsFor, countsAgainstVendor, describeCancelReason } from './cancel-reasons';

describe('cancel reasons', () => {
  it('customers and vendors each have their own list', () => {
    expect(Object.keys(cancelReasonsFor('CUSTOMER'))).toEqual(['plans_changed', 'found_another_vendor', 'event_cancelled', 'price', 'other']);
    expect(Object.keys(cancelReasonsFor('VENDOR'))).toEqual(['customer_didnt_pay', 'safety_concern', 'emergency', 'double_booked', 'other']);
  });

  it('labels the reason, and the note follows it', () => {
    expect(cancelReasonLabel('double_booked', 'VENDOR')).toBe('Double booked');
    expect(cancelReasonLabel('non_payment', 'SYSTEM')).toBe('Payment not made in time');
    expect(cancelReasonLabel(null, 'VENDOR')).toBeNull();
    expect(describeCancelReason({ cancelled_by: 'CUSTOMER', cancel_reason_code: 'price', cancel_reason: 'Found it cheaper' })).toBe('Price. Found it cheaper');
    // bookings cancelled before the lists: only the free text
    expect(describeCancelReason({ cancelled_by: null, cancel_reason_code: null, cancel_reason: 'Changed mind' })).toBe('Changed mind');
  });

  it('counts a vendor’s own cancellations, not non-payment or safety', () => {
    expect(countsAgainstVendor('VENDOR', 'double_booked')).toBe(true);
    expect(countsAgainstVendor('VENDOR', 'other')).toBe(true);
    expect(countsAgainstVendor('VENDOR', null)).toBe(true);
    expect(countsAgainstVendor('VENDOR', 'customer_didnt_pay')).toBe(false);
    expect(countsAgainstVendor('VENDOR', 'safety_concern')).toBe(false);
    expect(countsAgainstVendor('SYSTEM', 'non_payment')).toBe(false);
    expect(countsAgainstVendor('CUSTOMER', 'other')).toBe(false);
  });
});
