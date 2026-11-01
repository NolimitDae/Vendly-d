import { stripeKeyMode } from './StripePayment';

describe('stripeKeyMode', () => {
  it('reads the mode from full and restricted keys', () => {
    expect(stripeKeyMode('sk_live_abc')).toBe('live');
    expect(stripeKeyMode('rk_live_abc')).toBe('live');
    expect(stripeKeyMode('sk_test_abc')).toBe('test');
    expect(stripeKeyMode('rk_test_abc')).toBe('test');
    expect(stripeKeyMode('')).toBe('unknown');
    expect(stripeKeyMode('pk_live_abc')).toBe('unknown');
  });
});
