import { randomInt } from 'crypto';
import { TEST_EMAIL_DOMAIN } from 'src/common/helper/test-accounts';
import { normalizeHandle } from 'src/common/helper/handle';
import { validTimeZone } from 'src/modules/vendor/working-hours';

/** "Photography & Video" -> "photography-video" */
export function categorySlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'category'
  );
}

/** test-photography-video-1@vendly.test */
export const testEmail = (categoryName: string, n: number) => `test-${categorySlug(categoryName)}-${n}@${TEST_EMAIL_DOMAIN}`;

/** Shop handle test-photography-video-1, shortened to fit the 30-character limit; null if it still isn't valid. */
export function testHandle(categoryName: string, n: number): string | null {
  const tail = `-${n}`;
  const head = `test-${categorySlug(categoryName)}`.slice(0, 30 - tail.length).replace(/-+$/, '');
  const result = normalizeHandle(`${head}${tail}`);
  return 'handle' in result ? result.handle : null;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** A random shared password like "Kp7r-xQ2m-9fTa-Wc4z" (no look-alike characters). */
export function generatePassword(): string {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return [group(), group(), group(), group()].join('-');
}

// most US states sit in one zone; the few that span two use their main one
const STATE_ZONES: Record<string, string> = {
  CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York', FL: 'America/New_York', GA: 'America/New_York',
  KY: 'America/New_York', ME: 'America/New_York', MD: 'America/New_York', MA: 'America/New_York', NH: 'America/New_York',
  NJ: 'America/New_York', NY: 'America/New_York', NC: 'America/New_York', OH: 'America/New_York', PA: 'America/New_York',
  RI: 'America/New_York', SC: 'America/New_York', VT: 'America/New_York', VA: 'America/New_York', WV: 'America/New_York',
  IN: 'America/Indiana/Indianapolis', MI: 'America/Detroit',
  AL: 'America/Chicago', AR: 'America/Chicago', IL: 'America/Chicago', IA: 'America/Chicago', KS: 'America/Chicago',
  LA: 'America/Chicago', MN: 'America/Chicago', MS: 'America/Chicago', MO: 'America/Chicago', NE: 'America/Chicago',
  ND: 'America/Chicago', OK: 'America/Chicago', SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago', WI: 'America/Chicago',
  CO: 'America/Denver', ID: 'America/Boise', MT: 'America/Denver', NM: 'America/Denver', UT: 'America/Denver', WY: 'America/Denver',
  AZ: 'America/Phoenix', CA: 'America/Los_Angeles', NV: 'America/Los_Angeles', OR: 'America/Los_Angeles', WA: 'America/Los_Angeles',
  AK: 'America/Anchorage', HI: 'Pacific/Honolulu',
};

/**
 * The vendor time zone for a place: from a US state code in the text ("Atlanta, GA"), else from
 * the longitude (US mainland bands, or a whole-hour zone elsewhere). Close enough for demo vendors.
 */
export function guessTimeZone(label: string, point: { lat: number; lng: number }): string {
  const codes = label.toUpperCase().match(/\b[A-Z]{2}\b/g) ?? [];
  for (const code of codes.reverse()) if (STATE_ZONES[code]) return STATE_ZONES[code];
  const { lat, lng } = point;
  if (lat > 24 && lat < 50 && lng > -125 && lng < -66) {
    if (lng >= -86.5) return 'America/New_York';
    if (lng >= -101) return 'America/Chicago';
    if (lng >= -114.5) return 'America/Denver';
    return 'America/Los_Angeles';
  }
  const offset = Math.round(lng / 15);
  // Etc/GMT zones are named with the sign flipped (Etc/GMT-1 is one hour ahead of UTC)
  const zone = offset === 0 ? 'UTC' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
  return validTimeZone(zone) ?? 'UTC';
}

/** A spot a few miles from `center`, different for each vendor index, so the test vendors don't all sit on one pin. */
export function spreadAround(center: { lat: number; lng: number }, index: number) {
  const miles = 1.5 + (index % 5) * 1.2;
  const angle = (index * 137.5 * Math.PI) / 180;
  const lat = center.lat + (miles / 69) * Math.cos(angle);
  const lng = center.lng + (miles / (69.172 * Math.max(0.01, Math.cos((center.lat * Math.PI) / 180)))) * Math.sin(angle);
  return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
}
