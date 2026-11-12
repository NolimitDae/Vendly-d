import { splitAcrossPayments } from './payout-sources';

describe('splitAcrossPayments', () => {
  it('takes from the largest payment first and never more than a payment has left', () => {
    expect(splitAcrossPayments(300, [{ paymentIntentId: 'a', room: 100 }, { paymentIntentId: 'b', room: 250 }])).toEqual({
      parts: [{ paymentIntentId: 'b', amount: 250 }, { paymentIntentId: 'a', amount: 50 }],
      rest: 0,
    });
  });

  it('returns what fits on no payment, and skips empty or repeated ones', () => {
    expect(splitAcrossPayments(120.5, [{ paymentIntentId: 'a', room: 0 }, { paymentIntentId: 'b', room: 50 }, { paymentIntentId: 'b', room: 20.25 }])).toEqual({
      parts: [{ paymentIntentId: 'b', amount: 70.25 }],
      rest: 50.25,
    });
    expect(splitAcrossPayments(10, [])).toEqual({ parts: [], rest: 10 });
  });
});
