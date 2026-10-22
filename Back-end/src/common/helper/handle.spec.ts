import { normalizeHandle } from './handle';

describe('normalizeHandle', () => {
  it('lower-cases and trims a valid handle', () => {
    expect(normalizeHandle('  Bellas-Catering ')).toEqual({ handle: 'bellas-catering' });
  });

  it('clears the handle when empty', () => {
    expect(normalizeHandle('')).toEqual({ handle: null });
  });

  it.each(['ab', 'a'.repeat(31), '-bella', 'bella-', 'bella--cakes', 'bella cakes', 'bella_cakes', 'béla'])('rejects %s', (h) => {
    expect(normalizeHandle(h)).toHaveProperty('error');
  });

  it('rejects reserved words', () => {
    expect(normalizeHandle('Admin')).toEqual({ error: 'That shop link is reserved. Try another.' });
  });
});
