// Vendors' social accounts on their shop page. Vendors type a handle (@bellascatering) or paste a link;
// either way a full https link is stored, and a platform's link must really point at that platform
// so an "Instagram" button can't send customers somewhere else.

export const SOCIAL_KEYS = ['website', 'instagram', 'tiktok', 'facebook', 'youtube', 'x'] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];
export type SocialLinks = Record<SocialKey, string | null>;

type Platform = {
  label: string;
  hosts: string[];
  // a bare handle (no @) that this platform allows
  handle: RegExp;
  // the profile link for a handle
  profile: (handle: string) => string;
  // the handle from a pasted link's path, or null to keep the pasted path as it is
  fromPath?: (path: string) => string | null;
};

const firstSegment = (prefix = '') => (path: string) => {
  const seg = path.split('/').filter(Boolean)[0] ?? '';
  return seg.startsWith(prefix) ? seg.slice(prefix.length) : null;
};

const PLATFORMS: Record<Exclude<SocialKey, 'website'>, Platform> = {
  instagram: {
    label: 'Instagram',
    hosts: ['instagram.com'],
    handle: /^[a-z0-9._]{1,30}$/i,
    profile: (h) => `https://www.instagram.com/${h}`,
    fromPath: firstSegment(),
  },
  tiktok: {
    label: 'TikTok',
    hosts: ['tiktok.com'],
    handle: /^[a-z0-9._]{2,24}$/i,
    profile: (h) => `https://www.tiktok.com/@${h}`,
    fromPath: firstSegment('@'),
  },
  facebook: {
    label: 'Facebook',
    hosts: ['facebook.com', 'fb.com'],
    handle: /^[a-z0-9.]{5,50}$/i,
    profile: (h) => `https://www.facebook.com/${h}`,
  },
  youtube: {
    label: 'YouTube',
    hosts: ['youtube.com', 'youtu.be'],
    handle: /^[a-z0-9._-]{3,30}$/i,
    profile: (h) => `https://www.youtube.com/@${h}`,
  },
  x: {
    label: 'X',
    hosts: ['x.com', 'twitter.com'],
    handle: /^[a-z0-9_]{1,15}$/i,
    profile: (h) => `https://x.com/${h}`,
    fromPath: firstSegment(),
  },
};

const onHost = (host: string, hosts: string[]) => hosts.some((h) => host === h || host.endsWith('.' + h));

/** Reads a typed link: adds https:// when missing; only plain web links (no logins in the link). */
function parseLink(raw: string): URL | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || !url.hostname.includes('.')) return null;
  return url;
}

/**
 * One social field as typed by the vendor. Empty clears it (null). Returns the link to store, or an
 * error message to show.
 */
export function normalizeSocial(key: SocialKey, raw: unknown): { link: string | null } | { error: string } {
  if (raw === null) return { link: null };
  if (typeof raw !== 'string') return { error: 'Social links must be text.' };
  const value = raw.trim();
  if (!value) return { link: null };
  if (value.length > 255) return { error: 'That link is too long.' };

  if (key === 'website') {
    const url = parseLink(value);
    if (!url) return { error: 'Enter your website like yourbusiness.com.' };
    url.protocol = 'https:';
    return { link: url.toString() };
  }

  const p = PLATFORMS[key];
  const bare = value.replace(/^@/, '');
  if (p.handle.test(bare) && !bare.includes('.com')) return { link: p.profile(bare) };

  const url = parseLink(value);
  if (!url || !onHost(url.hostname.toLowerCase(), p.hosts))
    return { error: `Enter your ${p.label} @handle or a ${p.label} link.` };
  if (p.fromPath) {
    const handle = p.fromPath(url.pathname);
    if (!handle || !p.handle.test(handle)) return { error: `Enter your ${p.label} @handle or a ${p.label} link.` };
    return { link: p.profile(handle) };
  }
  // links whose path isn't a plain handle (facebook.com/profile.php?id=…, youtube.com/channel/…) are kept as pasted
  if (url.pathname === '/' || !url.pathname) return { error: `Enter your ${p.label} @handle or a ${p.label} link.` };
  url.protocol = 'https:';
  url.hash = '';
  return { link: url.toString() };
}

/** The social links a vendor profile row holds, for the website and app. */
export function readSocials(profile: Partial<Record<SocialKey, string | null>> | null | undefined): SocialLinks {
  return Object.fromEntries(SOCIAL_KEYS.map((k) => [k, profile?.[k] ?? null])) as SocialLinks;
}

/** Prisma select for the social link columns. */
export const SOCIALS_SELECT = Object.fromEntries(SOCIAL_KEYS.map((k) => [k, true])) as Record<SocialKey, true>;
