import { PHOTOS_OR_PDF, safeStoredNames, sniffUpload } from '../../../common/helper/upload-files';

/** What can be sent in chat: photos and PDFs, recognised by their content, not their name. */
export const ATTACHMENT_REFUSED = 'You can send photos (JPG, PNG, GIF, WebP or HEIC) or PDFs.';

/** The file's real type as an extension, or null when it isn't one chat accepts. */
export function attachmentExt(buffer: Buffer | undefined | null): string | null {
  return sniffUpload(buffer, PHOTOS_OR_PDF);
}

/**
 * A safe stored name for each file (random, with the extension of its real type), or a 400 if any
 * file isn't a photo or PDF. Nothing of the uploaded file name is kept.
 */
export function safeAttachmentNames(files: { buffer: Buffer }[]): string[] {
  return safeStoredNames(files, PHOTOS_OR_PDF, ATTACHMENT_REFUSED);
}
