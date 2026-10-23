import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';

/**
 * Uploaded files are recognised by their content (magic bytes), never by the name or the
 * Content-Type the client sent, and stored under a random name with the extension of their real
 * type. Nothing of the uploaded file name is kept in the stored key, so a file can't pick its own
 * path or extension (e.g. `x.html` served from public storage).
 */
export type UploadKind = 'image' | 'pdf' | 'doc' | 'video';

const latin1 = (b: Buffer, start: number, end: number) => b.subarray(start, end).toString('latin1');
const ftypBrand = (b: Buffer) => (b.length > 12 && latin1(b, 4, 8) === 'ftyp' ? latin1(b, 8, 12) : null);

const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'mif1', 'msf1'];
const MP4_BRANDS = ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'M4VP', 'MSNV', 'dash', '3gp4', '3gp5', '3g2a'];

/** Zip-based files: Word/Excel/PowerPoint (OOXML) are told apart by their parts; anything else is a zip. */
function zipKind(b: Buffer): string | null {
  // local file header; an empty archive (PK\x05\x06) has nothing worth sending
  if (!(b.length > 30 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04)) return null;
  // macro-enabled Office files (.docm/.xlsm/.pptm) carry vbaProject.bin: refused
  if (b.includes('vbaProject.bin')) return null;
  if (b.includes('[Content_Types].xml')) {
    if (b.includes('word/')) return 'docx';
    if (b.includes('xl/')) return 'xlsx';
    if (b.includes('ppt/')) return 'pptx';
  }
  return 'zip';
}

const SNIFFERS: Record<UploadKind, ((b: Buffer) => string | null)[]> = {
  image: [
    (b) => (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'jpg' : null),
    (b) => (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'png' : null),
    (b) => (b.length > 6 && (latin1(b, 0, 6) === 'GIF87a' || latin1(b, 0, 6) === 'GIF89a') ? 'gif' : null),
    (b) => (b.length > 12 && latin1(b, 0, 4) === 'RIFF' && latin1(b, 8, 12) === 'WEBP' ? 'webp' : null),
    // iPhone photos
    (b) => (HEIC_BRANDS.includes(ftypBrand(b) ?? '') ? 'heic' : null),
  ],
  pdf: [(b) => (b.length > 5 && latin1(b, 0, 5) === '%PDF-' ? 'pdf' : null)],
  doc: [zipKind],
  video: [
    (b) => (ftypBrand(b) === 'qt  ' ? 'mov' : null),
    (b) => (MP4_BRANDS.includes(ftypBrand(b) ?? '') ? 'mp4' : null),
    // Matroska/WebM: EBML header with the "webm" doc type
    (b) => (b.length > 32 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 && b.subarray(0, 64).includes('webm') ? 'webm' : null),
  ],
};

const LABELS: Record<UploadKind, string> = {
  image: 'photos (JPG, PNG, GIF, WebP or HEIC)',
  pdf: 'PDFs',
  doc: 'documents (Word, Excel, PowerPoint or ZIP)',
  video: 'videos (MP4, MOV or WebM)',
};

/** "You can upload photos (…) or PDFs." for the given kinds. */
export function uploadRefusedMessage(allowed: UploadKind[]): string {
  const parts = allowed.map((k) => LABELS[k]);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}` : parts[0];
  return `That file type isn't allowed. You can upload ${list}.`;
}

/** The file's real type as an extension, or null when it isn't one of the allowed kinds. */
export function sniffUpload(buffer: Buffer | undefined | null, allowed: UploadKind[]): string | null {
  if (!buffer?.length) return null;
  for (const kind of allowed) {
    for (const sniff of SNIFFERS[kind]) {
      const ext = sniff(buffer);
      if (ext) return ext;
    }
  }
  return null;
}

/** A random stored name with the file's real extension, or a 400 saying what is allowed. */
export function safeStoredName(buffer: Buffer | undefined | null, allowed: UploadKind[], refused?: string): string {
  const ext = sniffUpload(buffer, allowed);
  if (!ext) throw new BadRequestException(refused ?? uploadRefusedMessage(allowed));
  return `${randomBytes(12).toString('hex')}.${ext}`;
}

/**
 * Names for every file, checked all together first, so nothing is stored (or replaced) when any
 * one of them is refused.
 */
export function safeStoredNames(files: { buffer: Buffer }[] | undefined | null, allowed: UploadKind[], refused?: string): string[] {
  return (files ?? []).map((f) => safeStoredName(f?.buffer, allowed, refused));
}

/** What each upload path accepts. */
export const PHOTOS: UploadKind[] = ['image'];
export const PHOTOS_OR_PDF: UploadKind[] = ['image', 'pdf'];
/** Files a vendor delivers to a customer. */
export const DELIVERABLE_FILES: UploadKind[] = ['image', 'pdf', 'doc', 'video'];
