import { normalizeSocial, readSocials } from './social-links';

const link = (key: Parameters<typeof normalizeSocial>[0], raw: unknown) => {
  const r = normalizeSocial(key, raw);
  return 'link' in r ? r.link : `ERR ${r.error}`;
};

describe('normalizeSocial', () => {
  it('clears on empty or null', () => {
    expect(link('instagram', '')).toBeNull();
    expect(link('instagram', '   ')).toBeNull();
    expect(link('website', null)).toBeNull();
  });

  it('turns handles into profile links', () => {
    expect(link('instagram', '@bellas.catering')).toBe('https://www.instagram.com/bellas.catering');
    expect(link('tiktok', 'bellas_eats')).toBe('https://www.tiktok.com/@bellas_eats');
    expect(link('x', '@bella')).toBe('https://x.com/bella');
    expect(link('youtube', '@BellaCooks')).toBe('https://www.youtube.com/@BellaCooks');
    expect(link('facebook', 'bellascatering')).toBe('https://www.facebook.com/bellascatering');
  });

  it('reads pasted platform links back to a clean profile link', () => {
    expect(link('instagram', 'https://instagram.com/bella/?hl=en')).toBe('https://www.instagram.com/bella');
    expect(link('tiktok', 'tiktok.com/@bella?lang=en')).toBe('https://www.tiktok.com/@bella');
    expect(link('x', 'https://twitter.com/bella')).toBe('https://x.com/bella');
    expect(link('facebook', 'http://m.facebook.com/profile.php?id=123')).toBe('https://m.facebook.com/profile.php?id=123');
    expect(link('youtube', 'youtube.com/channel/UC123')).toBe('https://youtube.com/channel/UC123');
  });

  it("refuses links that don't point at the platform", () => {
    expect(link('instagram', 'https://evil.example/instagram.com/bella')).toMatch(/^ERR/);
    expect(link('instagram', 'https://instagram.com.evil.example/bella')).toMatch(/^ERR/);
    expect(link('facebook', 'facebook.com')).toMatch(/^ERR/);
    expect(link('tiktok', 'tiktok.com/bella')).toMatch(/^ERR/);
  });

  it('only stores plain web links for the website', () => {
    expect(link('website', 'bellas.com')).toBe('https://bellas.com/');
    expect(link('website', 'http://bellas.com/menu')).toBe('https://bellas.com/menu');
    expect(link('website', 'javascript:alert(1)')).toMatch(/^ERR/);
    expect(link('website', 'https://user:pw@bellas.com')).toMatch(/^ERR/);
    expect(link('website', 'localhost')).toMatch(/^ERR/);
    expect(link('website', { a: 1 })).toMatch(/^ERR/);
  });

  it('readSocials fills every key', () => {
    expect(readSocials({ instagram: 'https://www.instagram.com/b' })).toEqual({
      website: null, instagram: 'https://www.instagram.com/b', tiktok: null, facebook: null, youtube: null, x: null,
    });
    expect(readSocials(null).website).toBeNull();
  });
});
