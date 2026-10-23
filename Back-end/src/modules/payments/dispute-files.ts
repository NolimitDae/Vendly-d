import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import appConfig from 'src/config/app.config';
import { PHOTOS, sniffUpload } from 'src/common/helper/upload-files';
import { PrivateStorage, SignedUrl } from 'src/modules/contracts/private-storage';

/** What a customer can say went wrong. */
export const DISPUTE_CATEGORIES = ['no_show', 'late', 'not_as_described', 'quality', 'damage', 'billing', 'other'] as const;
export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number];

/** What the customer asks Vendly for. */
export const DISPUTE_OUTCOMES = ['full_refund', 'partial_refund', 'other'] as const;
export type DisputeOutcome = (typeof DISPUTE_OUTCOMES)[number];

export const DISPUTE_CATEGORY_LABELS: Record<DisputeCategory, string> = {
  no_show: 'Vendor didn’t show up',
  late: 'Vendor was late',
  not_as_described: 'Not as described',
  quality: 'Poor quality',
  damage: 'Damage',
  billing: 'Billing problem',
  other: 'Something else',
};

export const DISPUTE_OUTCOME_LABELS: Record<DisputeOutcome, string> = {
  full_refund: 'a full refund',
  partial_refund: 'a partial refund',
  other: 'something else',
};

export const DISPUTE_MAX_PHOTOS = 10;
export const DISPUTE_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
/** Signed photo links last this long (the booking page and the admin queue reload them). */
const LINK_TTL_SECONDS = 30 * 60;
const FOLDER = 'disputes';

/** Photos only, recognised by their content. HEIC is refused: Vendly reviews in a browser that can't show it. */
const PHOTO_TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
export const DISPUTE_PHOTO_REFUSED = 'Photos must be JPEG, PNG, WebP or GIF images.';

export function disputePhotoExt(buffer: Buffer | undefined | null): string | null {
  const ext = sniffUpload(buffer, PHOTOS);
  return ext && PHOTO_TYPES[ext] ? ext : null;
}

/** Checks every photo before any is stored; returns their real extensions. */
export function checkDisputePhotos(photos: { buffer: Buffer; size?: number }[]): string[] {
  if (photos.length > DISPUTE_MAX_PHOTOS) throw new BadRequestException(`Add up to ${DISPUTE_MAX_PHOTOS} photos.`);
  return photos.map((p) => {
    if ((p.size ?? p.buffer?.length ?? 0) > DISPUTE_PHOTO_MAX_BYTES) throw new BadRequestException('Each photo must be under 10 MB.');
    const ext = disputePhotoExt(p.buffer);
    if (!ext) throw new BadRequestException(DISPUTE_PHOTO_REFUSED);
    return ext;
  });
}

/** Stores the photos in private storage; returns their keys (never public URLs). Removes what it stored if one fails. */
export async function storeDisputePhotos(bookingId: string, photos: { buffer: Buffer }[], exts: string[]): Promise<string[]> {
  const keys: string[] = [];
  try {
    for (let i = 0; i < photos.length; i++) {
      const key = PrivateStorage.newKey(`${FOLDER}/${bookingId}`, exts[i]);
      await PrivateStorage.put(key, photos[i].buffer);
      keys.push(key);
    }
    return keys;
  } catch (err) {
    await removeDisputePhotos(keys);
    throw err;
  }
}

export async function removeDisputePhotos(keys: string[]) {
  await Promise.all(keys.map((k) => PrivateStorage.remove(k).catch(() => null)));
}

/** A short-lived signed link to one dispute photo, for the customer, the vendor or Vendly. */
export function disputePhotoUrl(key: string, viewerId: string, bookingId: string) {
  const base = appConfig().app.url ?? '';
  return `${base}/api/dispute-files/${SignedUrl.sign({ key, uid: viewerId, cid: bookingId, name: 'dispute-photo' }, LINK_TTL_SECONDS)}`;
}

export function disputePhotoUrls(keys: string[] | null | undefined, viewerId: string, bookingId: string) {
  return (keys ?? []).map((k) => disputePhotoUrl(k, viewerId, bookingId));
}

/** Serves a photo from a signed link. Only dispute keys: contract and ID links share the signing secret. */
export async function resolveDisputeFile(token: string) {
  const claims = SignedUrl.verify(token);
  if (!claims || !claims.key.startsWith(`${FOLDER}/`)) throw new ForbiddenException('This link has expired.');
  const buffer = await PrivateStorage.get(claims.key).catch(() => {
    throw new NotFoundException('File not found');
  });
  const ext = disputePhotoExt(buffer) ?? 'jpg';
  return { buffer, type: PHOTO_TYPES[ext], name: `${claims.name}.${ext}` };
}

/** "Vendor was late · asks for a partial refund of $50.00", for notices and the admin queue. */
export function describeDisputeAsk(d: { category?: string | null; outcome?: string | null; requested_amount?: unknown }) {
  const parts: string[] = [];
  if (d.category) parts.push(DISPUTE_CATEGORY_LABELS[d.category as DisputeCategory] ?? d.category);
  if (d.outcome) {
    const amt = d.outcome === 'partial_refund' && d.requested_amount != null ? ` of $${Number(d.requested_amount).toFixed(2)}` : '';
    parts.push(`asks for ${DISPUTE_OUTCOME_LABELS[d.outcome as DisputeOutcome] ?? d.outcome}${amt}`);
  }
  return parts.join(' · ');
}
