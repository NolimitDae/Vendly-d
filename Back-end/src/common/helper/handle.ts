import { TanvirStorage } from '../lib/Disk/TanvirStorage';
import appConfig from '../../config/app.config';

/** Public URL of a shop banner/logo filename (stored in the avatar dir), or null. */
export const shopImageUrl = (name?: string | null) =>
  name ? TanvirStorage.url(appConfig().storageUrl.avatar + '/' + name) : null;

// Shop links live at vendlymarketplace.com/v/<handle>; words that look official are kept back.
const RESERVED = new Set(['admin', 'api', 'help', 'support', 'vendly', 'vendlymarketplace', 'settings', 'login', 'signup', 'official']);

/** Lower-cases and checks a vendor shop handle. An empty value clears it. */
export function normalizeHandle(raw: string): { handle: string | null } | { error: string } {
  const handle = raw.trim().toLowerCase();
  if (!handle) return { handle: null };
  if (!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(handle) || handle.includes('--'))
    return { error: 'Shop links are 3–30 letters, numbers or single dashes, starting and ending with a letter or number.' };
  if (RESERVED.has(handle)) return { error: 'That shop link is reserved. Try another.' };
  return { handle };
}
