import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import appConfig from 'src/config/app.config';
import { PrivateStorage, SignedUrl } from 'src/modules/contracts/private-storage';
import { DISPUTE_PHOTO_MAX_BYTES, DISPUTE_PHOTO_REFUSED, disputePhotoExt } from 'src/modules/payments/dispute-files';

/**
 * Inspiration photos a customer attaches to a booking request ("what I have in mind"). Kept in private
 * storage like dispute photos, with the same types and size limit, and shown through signed links.
 */
export const REQUEST_MAX_PHOTOS = 10;
export const REQUEST_PHOTO_MAX_BYTES = DISPUTE_PHOTO_MAX_BYTES;
const LINK_TTL_SECONDS = 30 * 60;
const FOLDER = 'request-photos';
const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

/** Checks every photo before any is stored; returns their real extensions. */
export function checkRequestPhotos(photos: { buffer: Buffer; size?: number }[]): string[] {
  if (photos.length > REQUEST_MAX_PHOTOS) throw new BadRequestException(`Add up to ${REQUEST_MAX_PHOTOS} photos.`);
  return photos.map((p) => {
    if ((p.size ?? p.buffer?.length ?? 0) > REQUEST_PHOTO_MAX_BYTES) throw new BadRequestException('Each photo must be under 10 MB.');
    const ext = disputePhotoExt(p.buffer);
    if (!ext) throw new BadRequestException(DISPUTE_PHOTO_REFUSED);
    return ext;
  });
}

/** Stores the photos privately; returns their keys. Removes what it stored if one fails. */
export async function storeRequestPhotos(bookingId: string, photos: { buffer: Buffer }[], exts: string[]): Promise<string[]> {
  const keys: string[] = [];
  try {
    for (let i = 0; i < photos.length; i++) {
      const key = PrivateStorage.newKey(`${FOLDER}/${bookingId}`, exts[i]);
      await PrivateStorage.put(key, photos[i].buffer);
      keys.push(key);
    }
    return keys;
  } catch (err) {
    await removeRequestPhotos(keys);
    throw err;
  }
}

export async function removeRequestPhotos(keys: string[]) {
  await Promise.all(keys.map((k) => PrivateStorage.remove(k).catch(() => null)));
}

/** Short-lived signed links for the customer, the vendor or Vendly; the stored keys never leave the API. */
export function requestPhotoUrls(keys: string[] | null | undefined, viewerId: string, bookingId: string) {
  const base = appConfig().app.url ?? '';
  return (keys ?? []).map((key) => `${base}/api/request-photos/${SignedUrl.sign({ key, uid: viewerId, cid: bookingId, name: 'inspiration-photo' }, LINK_TTL_SECONDS)}`);
}

/** Serves a photo from a signed link. Only request-photo keys: other private files share the signing secret. */
export async function resolveRequestPhoto(token: string) {
  const claims = SignedUrl.verify(token);
  if (!claims || !claims.key.startsWith(`${FOLDER}/`)) throw new ForbiddenException('This link has expired.');
  const buffer = await PrivateStorage.get(claims.key).catch(() => {
    throw new NotFoundException('File not found');
  });
  const ext = disputePhotoExt(buffer) ?? 'jpg';
  return { buffer, type: TYPES[ext], name: `${claims.name}.${ext}` };
}
