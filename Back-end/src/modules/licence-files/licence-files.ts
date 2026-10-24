import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs/promises';
import appConfig from 'src/config/app.config';
import { PHOTOS_OR_PDF, sniffUpload, uploadRefusedMessage } from 'src/common/helper/upload-files';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import { DownloadClaims, PrivateStorage, SignedUrl } from 'src/modules/contracts/private-storage';

/**
 * Vendor trade licences and event-planner licences. They live in private storage under
 * `licences/<vendor|planner>/<userId>/...` and are only reachable through short-lived signed links
 * handed to their owner and to admins. Older rows still hold bare file names of copies in the
 * public bucket; those are moved on start-up (licence-files.service.ts) and served through the same
 * signed route until then.
 */
export type LicenceKind = 'vendor' | 'planner';
const KINDS: LicenceKind[] = ['vendor', 'planner'];

const FOLDER = 'licences';
/** Signed-link keys for files still in the public bucket: `licences/legacy/<kind>/<name>`. */
const LEGACY = `${FOLDER}/legacy`;
/** Signed links last this long (the admin queue and the profile page reload them). */
const LINK_TTL_SECONDS = 30 * 60;

export const LICENCE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
};

/** A value stored by the private upload path (anything else is a legacy public file name). */
export const isLicenceKey = (value: string) => value.startsWith(`${FOLDER}/`);

/** A legacy value is a bare file name: no folders, so it can't reach outside the licence folder. */
export const isLegacyName = (value: string) => !!value && !/[/\\]/.test(value) && value !== '.' && value !== '..';

/** Where the old upload path put a licence in the public bucket (exactly as it was written). */
export function legacyPublicKey(kind: LicenceKind, name: string) {
  return kind === 'vendor' ? `${appConfig().storageUrl.license}/${name}` : `event-planner/license/${name}`;
}

/** The private key a legacy file is moved to. Derived from its name, so a retried move writes the same key. */
export function movedLicenceKey(kind: LicenceKind, userId: string, name: string) {
  return `${FOLDER}/${kind}/${userId}/legacy-${name.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

/** Checks every file is a photo or PDF before any is stored; returns their real extensions. */
export function checkLicenceFiles(files: { buffer: Buffer }[]): string[] {
  return files.map((f) => {
    const ext = sniffUpload(f?.buffer, PHOTOS_OR_PDF);
    if (!ext) throw new BadRequestException(uploadRefusedMessage(PHOTOS_OR_PDF));
    return ext;
  });
}

/** Stores the files in private storage; returns their keys. Removes what it stored if one fails. */
export async function storeLicenceFiles(kind: LicenceKind, userId: string, files: { buffer: Buffer }[], exts: string[]): Promise<string[]> {
  const keys: string[] = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const key = PrivateStorage.newKey(`${FOLDER}/${kind}/${userId}`, exts[i]);
      await PrivateStorage.put(key, files[i].buffer);
      keys.push(key);
    }
    return keys;
  } catch (err) {
    await removeLicenceFiles(kind, keys);
    throw err;
  }
}

/** Deletes licence files, private keys and legacy public names alike. Never throws. */
export async function removeLicenceFiles(kind: LicenceKind, values: string[] | null | undefined) {
  await Promise.all(
    (values ?? []).map(async (v) => {
      try {
        if (isLicenceKey(v)) await PrivateStorage.remove(v);
        else if (isLegacyName(v)) await TanvirStorage.delete(legacyPublicKey(kind, v));
      } catch {
        // a leftover file is harmless: nothing links to it any more
      }
    }),
  );
}

/**
 * A short-lived signed link to one licence file. Only call this for the owner (viewerId = ownerId)
 * or for an admin: the route re-checks that the viewer is one of them.
 */
export function licenceFileUrl(kind: LicenceKind, ownerId: string, value: string, viewerId: string): string | null {
  const key = isLicenceKey(value) ? value : isLegacyName(value) ? `${LEGACY}/${kind}/${value}` : null;
  if (!key) return null;
  const base = appConfig().app.url ?? '';
  return `${base}/api/licence-files/${SignedUrl.sign({ key, uid: viewerId, cid: ownerId, name: 'licence' }, LINK_TTL_SECONDS)}`;
}

export function licenceFileUrls(kind: LicenceKind, ownerId: string, values: string[] | null | undefined, viewerId: string): string[] {
  return (values ?? []).map((v) => licenceFileUrl(kind, ownerId, v, viewerId)).filter((u): u is string => !!u);
}

export type LicenceSource =
  | { at: 'private'; key: string }
  | { at: 'public'; key: string; moved: string };

/**
 * Where a signed link points, or null when it isn't a licence link (contract, ID and dispute links
 * share the signing secret) or the key doesn't belong to the owner named in the link.
 */
export function licenceSource(claims: Pick<DownloadClaims, 'key' | 'cid'>): LicenceSource | null {
  const { key, cid } = claims;
  if (!cid || !key?.startsWith(`${FOLDER}/`)) return null;
  if (key.startsWith(`${LEGACY}/`)) {
    const [kind, ...rest] = key.slice(LEGACY.length + 1).split('/');
    const name = rest.join('/');
    if (!KINDS.includes(kind as LicenceKind) || !isLegacyName(name)) return null;
    // a link signed before the move still works afterwards
    return { at: 'public', key: legacyPublicKey(kind as LicenceKind, name), moved: movedLicenceKey(kind as LicenceKind, cid, name) };
  }
  const m = /^licences\/(vendor|planner)\/([^/]+)\/[^/]+$/.exec(key);
  return m && m[2] === cid ? { at: 'private', key } : null;
}

/** Reads a file from the public bucket as bytes (the storage driver's own get() isn't binary-safe on disk). */
export async function readPublicFile(key: string): Promise<Buffer> {
  const config = TanvirStorage.getConfig();
  if (config?.driver === 's3') {
    const body: any = await TanvirStorage.get(key);
    if (typeof body?.transformToByteArray === 'function') return Buffer.from(await body.transformToByteArray());
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  return fs.readFile(`${config?.connection?.rootUrl ?? appConfig().storageUrl.rootUrl}/${key}`);
}
