import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as AWS from 'aws-sdk';
import { contentTypeFor, storageSettings } from 'src/common/lib/Disk/storage-settings';

const ROOT = path.resolve(process.env.PRIVATE_STORAGE_DIR || './public/private');

function resolveKey(key: string) {
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error('Invalid storage key');
  return full;
}

/** A private S3 / R2 bucket when STORAGE_DRIVER=s3 and S3_PRIVATE_BUCKET are set; else null (local disk). */
let client: { s3: AWS.S3; bucket: string } | null | undefined;
function privateBucket() {
  if (client !== undefined) return client;
  const s = storageSettings();
  client =
    s.driver === 's3' && s.privateBucket
      ? {
          bucket: s.privateBucket,
          s3: new AWS.S3({
            endpoint: s.endpoint,
            region: s.region,
            signatureVersion: 'v4',
            s3ForcePathStyle: true,
            credentials: { accessKeyId: s.accessKeyId ?? '', secretAccessKey: s.secretAccessKey ?? '' },
          }),
        }
      : null;
  return client;
}

/** Test hook: re-read the storage settings. */
export const __resetPrivateStorage = () => {
  client = undefined;
};

/**
 * Files that must never be publicly reachable (contracts, signatures, event files). Stored in a
 * private bucket in production; downloads always go through the API's signed, expiring links.
 */
export const PrivateStorage = {
  newKey(folder: string, ext: string) {
    return `${folder}/${Date.now()}-${randomBytes(12).toString('hex')}.${ext}`;
  },

  async put(key: string, data: Buffer | Uint8Array) {
    const remote = privateBucket();
    if (remote) {
      resolveKey(key); // same key rules as on disk (no "../")
      await remote.s3.putObject({ Bucket: remote.bucket, Key: key, Body: Buffer.from(data), ContentType: contentTypeFor(key) }).promise();
      return;
    }
    const full = resolveKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  },

  async get(key: string): Promise<Buffer> {
    const remote = privateBucket();
    if (remote) {
      resolveKey(key);
      const obj = await remote.s3.getObject({ Bucket: remote.bucket, Key: key }).promise();
      return Buffer.from(obj.Body as Uint8Array);
    }
    return fs.readFile(resolveKey(key));
  },

  /** Deletes a file; a missing file is not an error. */
  async remove(key: string) {
    const remote = privateBucket();
    if (remote) {
      resolveKey(key);
      await remote.s3.deleteObject({ Bucket: remote.bucket, Key: key }).promise();
      return;
    }
    await fs.rm(resolveKey(key), { force: true });
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
