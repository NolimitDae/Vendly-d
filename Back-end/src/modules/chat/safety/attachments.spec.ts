import { BadRequestException } from '@nestjs/common';
import { attachmentExt, safeAttachmentNames } from './attachments';

const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(4)]);
const pdf = Buffer.from('%PDF-1.7\n');

describe('chat attachments', () => {
  it('recognises photos and PDFs by their content', () => {
    expect(attachmentExt(jpg)).toBe('jpg');
    expect(attachmentExt(png)).toBe('png');
    expect(attachmentExt(heic)).toBe('heic');
    expect(attachmentExt(pdf)).toBe('pdf');
  });

  it('refuses anything else, whatever it is called', () => {
    expect(attachmentExt(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(attachmentExt(Buffer.from('MZ\x90\x00'))).toBeNull();
    expect(attachmentExt(Buffer.alloc(0))).toBeNull();
    expect(() => safeAttachmentNames([{ buffer: jpg }, { buffer: Buffer.from('#!/bin/sh') }])).toThrow(BadRequestException);
  });

  it('stores files under random names with the real extension, never the uploaded name', () => {
    const [a, b] = safeAttachmentNames([{ buffer: jpg }, { buffer: pdf }]);
    expect(a).toMatch(/^[0-9a-f]{24}\.jpg$/);
    expect(b).toMatch(/^[0-9a-f]{24}\.pdf$/);
    expect(a).not.toBe(safeAttachmentNames([{ buffer: jpg }])[0]);
  });
});
