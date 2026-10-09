import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

const ROOT = path.resolve(process.env.PRIVATE_STORAGE_DIR || './public/private');

function resolveKey(key: string) {
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error('Invalid storage key');
  return full;
}

/** Files that must never be publicly reachable (contracts, signatures). */
export const PrivateStorage = {
  newKey(folder: string, ext: string) {
    return `${folder}/${Date.now()}-${randomBytes(12).toString('hex')}.${ext}`;
  },

  async put(key: string, data: Buffer | Uint8Array) {
    const full = resolveKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  },

  async get(key: string): Promise<Buffer> {
    return fs.readFile(resolveKey(key));
  },
};

function secret() {
  const s = process.env.JWT_SECRET || process.env.APP_KEY;
  if (!s) throw new Error('JWT_SECRET is required to sign download links');
  return s;
}

export interface DownloadClaims {
  key: string;
  uid: string;
  cid: string;
  name: string;
  exp: number;
}

const b64 = (s: string) => Buffer.from(s).toString('base64url');

export const SignedUrl = {
  sign(claims: Omit<DownloadClaims, 'exp'>, ttlSeconds = 300) {
    const payload = b64(JSON.stringify({ ...claims, exp: Date.now() + ttlSeconds * 1000 }));
    const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  },

  verify(token: string): DownloadClaims | null {
    const [payload, sig] = (token ?? '').split('.');
    if (!payload || !sig) return null;
    const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as DownloadClaims;
      return claims.exp > Date.now() ? claims : null;
    } catch {
      return null;
    }
  },
};
