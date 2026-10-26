import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('takes common ways of writing a number', () => {
    expect(normalizePhone('+1 (512) 555-0134')).toEqual({ phone: '+1 (512) 555-0134' });
    expect(normalizePhone('  07700  900123 ')).toEqual({ phone: '07700 900123' });
    expect(normalizePhone('555.0134.22')).toEqual({ phone: '555.0134.22' });
  });

  it('clears it when empty', () => {
    expect(normalizePhone('')).toEqual({ phone: null });
    expect(normalizePhone('   ')).toEqual({ phone: null });
  });

  it('refuses letters and numbers that are too short or too long', () => {
    expect(normalizePhone('call me')).toHaveProperty('error');
    expect(normalizePhone('555-0134 ext 2')).toHaveProperty('error');
    expect(normalizePhone('12345')).toHaveProperty('error');
    expect(normalizePhone('1'.repeat(21))).toHaveProperty('error');
    expect(normalizePhone('1'.repeat(20))).toEqual({ phone: '1'.repeat(20) });
  });
});
