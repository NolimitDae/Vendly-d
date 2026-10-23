import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';

/** What can be sent in chat: photos and PDFs, recognised by their content, not their name. */
const KINDS: { ext: string; test: (b: Buffer) => boolean }[] = [
  { ext: 'jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'gif', test: (b) => b.length > 6 && (b.subarray(0, 6).toString('latin1') === 'GIF87a' || b.subarray(0, 6).toString('latin1') === 'GIF89a') },
  { ext: 'webp', test: (b) => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  // iPhone photos
  { ext: 'heic', test: (b) => b.length > 12 && b.subarray(4, 8).toString('latin1') === 'ftyp' && ['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(b.subarray(8, 12).toString('latin1')) },
  { ext: 'pdf', test: (b) => b.length > 5 && b.subarray(0, 5).toString('latin1') === '%PDF-' },
];

export const ATTACHMENT_REFUSED = 'You can send photos (JPG, PNG, GIF, WebP or HEIC) or PDFs.';

/** The file's real type as an extension, or null when it isn't one chat accepts. */
export function attachmentExt(buffer: Buffer | undefined | null): string | null {
  if (!buffer?.length) return null;
  return KINDS.find((k) => k.test(buffer))?.ext ?? null;
}

/**
 * A safe stored name for each file (random, with the extension of its real type), or a 400 if any
 * file isn't a photo or PDF. Nothing of the uploaded file name is kept.
 */
export function safeAttachmentNames(files: { buffer: Buffer }[]): string[] {
  return files.map((f) => {
    const ext = attachmentExt(f.buffer);
    if (!ext) throw new BadRequestException(ATTACHMENT_REFUSED);
    return `${randomBytes(12).toString('hex')}.${ext}`;
  });
}
