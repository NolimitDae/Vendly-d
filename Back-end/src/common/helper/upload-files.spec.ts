import { BadRequestException } from '@nestjs/common';
import {
  DELIVERABLE_FILES,
  PHOTOS,
  PHOTOS_OR_PDF,
  safeStoredName,
  safeStoredNames,
  sniffUpload,
  uploadRefusedMessage,
} from './upload-files';

const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const gif = Buffer.from('GIF89a\x01\x00');
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
const ftyp = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${brand}`), Buffer.alloc(8)]);
const heic = ftyp('heic');
const mp4 = ftyp('isom');
const mov = ftyp('qt  ');
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]), Buffer.from('\x42\x82\x84webm'), Buffer.alloc(30)]);
const pdf = Buffer.from('%PDF-1.7\n');
const zipOf = (...names: string[]) =>
  Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26), ...names.map((n) => Buffer.from(n + '\0'))]);
const docx = zipOf('[Content_Types].xml', '_rels/.rels', 'word/document.xml');
const xlsx = zipOf('[Content_Types].xml', 'xl/workbook.xml');
const pptx = zipOf('[Content_Types].xml', 'ppt/presentation.xml');
const zip = zipOf('photos/IMG_0001.jpg');
const docm = zipOf('[Content_Types].xml', 'word/document.xml', 'word/vbaProject.bin');
const html = Buffer.from('<html><script>alert(1)</script></html>');
const exe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');

describe('upload files', () => {
  it('recognises photos by their content', () => {
    expect(sniffUpload(jpg, PHOTOS)).toBe('jpg');
    expect(sniffUpload(png, PHOTOS)).toBe('png');
    expect(sniffUpload(gif, PHOTOS)).toBe('gif');
    expect(sniffUpload(webp, PHOTOS)).toBe('webp');
    expect(sniffUpload(heic, PHOTOS)).toBe('heic');
  });

  it('only accepts the kinds asked for', () => {
    expect(sniffUpload(pdf, PHOTOS)).toBeNull();
    expect(sniffUpload(pdf, PHOTOS_OR_PDF)).toBe('pdf');
    expect(sniffUpload(mp4, PHOTOS_OR_PDF)).toBeNull();
    expect(sniffUpload(docx, PHOTOS_OR_PDF)).toBeNull();
  });

  it('recognises what a vendor delivers: documents, zips and videos', () => {
    expect(sniffUpload(docx, DELIVERABLE_FILES)).toBe('docx');
    expect(sniffUpload(xlsx, DELIVERABLE_FILES)).toBe('xlsx');
    expect(sniffUpload(pptx, DELIVERABLE_FILES)).toBe('pptx');
    expect(sniffUpload(zip, DELIVERABLE_FILES)).toBe('zip');
    expect(sniffUpload(mp4, DELIVERABLE_FILES)).toBe('mp4');
    expect(sniffUpload(mov, DELIVERABLE_FILES)).toBe('mov');
    expect(sniffUpload(webm, DELIVERABLE_FILES)).toBe('webm');
    expect(sniffUpload(heic, DELIVERABLE_FILES)).toBe('heic');
    expect(sniffUpload(pdf, DELIVERABLE_FILES)).toBe('pdf');
  });

  it('refuses web pages, programs, SVGs, macro documents and empty files, whatever they are called', () => {
    for (const b of [html, exe, svg, docm, Buffer.alloc(0), Buffer.from('PK\x05\x06')]) {
      expect(sniffUpload(b, DELIVERABLE_FILES)).toBeNull();
    }
    expect(sniffUpload(undefined, PHOTOS)).toBeNull();
  });

  it('names stored files at random with the real extension, never the uploaded name', () => {
    const a = safeStoredName(jpg, PHOTOS);
    expect(a).toMatch(/^[0-9a-f]{24}\.jpg$/);
    expect(safeStoredName(jpg, PHOTOS)).not.toBe(a);
    expect(safeStoredNames([{ buffer: pdf }, { buffer: png }], PHOTOS_OR_PDF)).toEqual([
      expect.stringMatching(/^[0-9a-f]{24}\.pdf$/),
      expect.stringMatching(/^[0-9a-f]{24}\.png$/),
    ]);
    expect(safeStoredNames(undefined, PHOTOS)).toEqual([]);
  });

  it('gives a 400 saying what is allowed', () => {
    expect(() => safeStoredName(html, PHOTOS)).toThrow(BadRequestException);
    expect(() => safeStoredName(html, PHOTOS)).toThrow("That file type isn't allowed. You can upload photos (JPG, PNG, GIF, WebP or HEIC).");
    expect(uploadRefusedMessage(PHOTOS_OR_PDF)).toBe("That file type isn't allowed. You can upload photos (JPG, PNG, GIF, WebP or HEIC) or PDFs.");
    expect(uploadRefusedMessage(DELIVERABLE_FILES)).toBe(
      "That file type isn't allowed. You can upload photos (JPG, PNG, GIF, WebP or HEIC), PDFs, documents (Word, Excel, PowerPoint or ZIP) or videos (MP4, MOV or WebM).",
    );
    expect(() => safeStoredNames([{ buffer: jpg }, { buffer: exe }], PHOTOS, 'Photos only')).toThrow('Photos only');
  });
});
