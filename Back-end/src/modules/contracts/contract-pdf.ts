import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Standard PDF fonts only cover WinAnsi; map common Unicode and drop the rest. */
export function pdfSafe(text: string) {
  return (text ?? '')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[·•]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\t/g, '    ')
    .replace(/[^\n\x20-\x7E¡-ÿ]/g, '?');
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      // hard-break words longer than a line (hashes, URLs)
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width) {
        let i = rest.length;
        while (i > 1 && font.widthOfTextAtSize(rest.slice(0, i), size) > width) i--;
        out.push(rest.slice(0, i));
        rest = rest.slice(i);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

class Writer {
  page!: PDFPage;
  y = 0;

  constructor(
    private doc: PDFDocument,
    private fonts: Fonts,
    private footer: string,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
    this.page.drawText(pdfSafe(this.footer), {
      x: MARGIN, y: 28, size: 8, font: this.fonts.regular, color: rgb(0.45, 0.45, 0.45),
    });
  }

  ensure(h: number) {
    if (this.y - h < MARGIN) this.newPage();
  }

  text(text: string, opts: { size?: number; bold?: boolean; indent?: number; gapAfter?: number; color?: [number, number, number] } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const indent = opts.indent ?? 0;
    const lineH = size * 1.35;
    for (const line of wrap(pdfSafe(text), font, size, PAGE_W - MARGIN * 2 - indent)) {
      this.ensure(lineH);
      this.y -= lineH;
      if (line) {
        this.page.drawText(line, {
          x: MARGIN + indent, y: this.y, size, font,
          color: opts.color ? rgb(...opts.color) : rgb(0.1, 0.1, 0.1),
        });
      }
    }
    this.y -= opts.gapAfter ?? 0;
  }

  gap(h: number) {
    this.y -= h;
  }

  rule() {
    this.ensure(10);
    this.y -= 6;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y }, end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
    });
    this.y -= 6;
  }
}

/** Renders the lightweight markdown used by contract templates (#, ##, -, paragraphs). */
function renderBody(w: Writer, body: string) {
  for (const raw of body.split('\n')) {
    const line = raw.trimEnd();
    if (line.startsWith('# ')) w.text(line.slice(2), { size: 18, bold: true, gapAfter: 8 });
    else if (line.startsWith('## ')) {
      w.gap(6);
      w.text(line.slice(3), { size: 12, bold: true, gapAfter: 2 });
    } else if (line.startsWith('- ')) w.text(`-  ${line.slice(2)}`, { indent: 10 });
    else if (!line.trim()) w.gap(4);
    else w.text(line);
  }
}

export interface CertificateSigner {
  role: string;
  legal_name: string;
  email?: string | null;
  signed_at: Date;
  ip_address?: string | null;
  device_platform?: string | null;
  app_version?: string | null;
  user_agent?: string | null;
  document_sha256: string;
  signatureImage?: Buffer | null;
}

export interface CertificateInput {
  bookingId: string;
  verificationCode: string;
  contractVersion: number;
  contentSha256: string;
  timezone: string;
  executedAt: Date;
  signers: CertificateSigner[];
  verifyUrl?: string;
}

function fmtStamp(d: Date, tz: string) {
  const local = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, dateStyle: 'medium', timeStyle: 'long',
  }).format(d);
  return `${local} (${d.toISOString()})`;
}

async function renderCertificate(doc: PDFDocument, fonts: Fonts, c: CertificateInput) {
  const w = new Writer(doc, fonts, `Signature certificate - Booking ${c.bookingId} - Verification ${c.verificationCode}`);
  w.text('Signature Certificate', { size: 18, bold: true, gapAfter: 6 });
  w.text(`Booking ID: ${c.bookingId}`);
  w.text(`Contract version: ${c.contractVersion}`);
  w.text(`Verification code: ${c.verificationCode}`);
  w.text(`Executed: ${fmtStamp(c.executedAt, c.timezone)}`);
  w.text(`Document hash signed (SHA-256): ${c.contentSha256}`, { size: 9 });
  if (c.verifyUrl) w.text(`Verify this document: ${c.verifyUrl}`, { size: 9 });
  w.text(
    'The SHA-256 hash of this final PDF is recorded by Vendly at execution. Any change to this file will fail verification.',
    { size: 9, color: [0.4, 0.4, 0.4] },
  );
  w.rule();

  for (const s of c.signers) {
    w.ensure(170);
    w.text(`${s.role}: ${s.legal_name}`, { size: 12, bold: true, gapAfter: 2 });
    if (s.signatureImage) {
      try {
        const img = await doc.embedPng(s.signatureImage);
        const scale = Math.min(200 / img.width, 60 / img.height, 1);
        const h = img.height * scale;
        w.ensure(h + 8);
        w.y -= h + 4;
        w.page.drawImage(img, { x: MARGIN, y: w.y, width: img.width * scale, height: h });
        w.gap(4);
      } catch {
        w.text('[signature image could not be rendered]', { size: 8 });
      }
    } else {
      w.text(`/s/ ${s.legal_name}`, { size: 14, gapAfter: 2 });
    }
    if (s.email) w.text(`Email: ${s.email}`, { size: 9 });
    w.text(`Signed: ${fmtStamp(s.signed_at, c.timezone)}`, { size: 9 });
    w.text(`IP address: ${s.ip_address ?? 'unknown'}`, { size: 9 });
    w.text(
      `Device: ${[s.device_platform, s.app_version && `app ${s.app_version}`].filter(Boolean).join(', ') || 'unknown'}`,
      { size: 9 },
    );
    if (s.user_agent) w.text(`User agent: ${s.user_agent.slice(0, 300)}`, { size: 8, color: [0.4, 0.4, 0.4] });
    w.text(`Document hash at signing: ${s.document_sha256}`, { size: 8 });
    w.text('Consent: signed electronically after agreeing to sign and receive this contract electronically.', { size: 8 });
    w.rule();
  }
}

export interface ExecutedPdfInput {
  title: string;
  renderedBody: string;
  sourcePdf?: Buffer | null;
  certificate: CertificateInput;
}

export async function buildExecutedPdf(input: ExecutedPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(input.title));
  doc.setProducer('Vendly');
  doc.setCreator('Vendly');
  doc.setSubject(`Booking ${input.certificate.bookingId}`);
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  if (input.sourcePdf) {
    const src = await PDFDocument.load(input.sourcePdf);
    const pages = await doc.copyPages(src, src.getPageIndices());
    pages.forEach((p) => doc.addPage(p));
  }

  const footer = `Booking ${input.certificate.bookingId} - Verification ${input.certificate.verificationCode}`;
  renderBody(new Writer(doc, fonts, footer), input.renderedBody);
  await renderCertificate(doc, fonts, input.certificate);
  return doc.save();
}

/** Unsigned preview of the contract text (for "download draft"). */
export async function buildDraftPdf(title: string, renderedBody: string, sourcePdf?: Buffer | null) {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`${title} (draft)`));
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  if (sourcePdf) {
    const src = await PDFDocument.load(sourcePdf);
    (await doc.copyPages(src, src.getPageIndices())).forEach((p) => doc.addPage(p));
  }
  renderBody(new Writer(doc, fonts, 'DRAFT - not signed'), renderedBody);
  return doc.save();
}

export class PdfValidationError extends Error {}

/** Checks real file contents, not the extension or declared MIME type. */
export async function validateUploadedPdf(buffer: Buffer | undefined) {
  if (!buffer || buffer.length === 0) throw new PdfValidationError('A PDF file is required.');
  if (buffer.length > MAX_UPLOAD_BYTES) throw new PdfValidationError('The PDF must be 10 MB or smaller.');
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new PdfValidationError('The file is not a PDF.');
  }
  // pdf-lib refuses encrypted documents unless told to ignore encryption
  if (/\/Encrypt\s/.test(buffer.toString('latin1'))) {
    throw new PdfValidationError('Encrypted or password-protected PDFs are not supported.');
  }
  let pageCount: number;
  try {
    // pdf-lib tolerates some corrupt files at load time and only fails when reading pages
    const doc = await PDFDocument.load(buffer);
    pageCount = doc.getPageCount();
  } catch (err: any) {
    if (err?.name === 'EncryptedPDFError' || /encrypt/i.test(err?.message ?? '')) {
      throw new PdfValidationError('Encrypted or password-protected PDFs are not supported.');
    }
    throw new PdfValidationError('The PDF could not be read. Please upload a valid PDF.');
  }
  if (pageCount === 0) throw new PdfValidationError('The PDF has no pages.');
  return { pageCount };
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Accepts a PNG data URL or base64 string from a signature pad. */
export function decodeSignatureImage(input?: string | null): Buffer | null {
  if (!input) return null;
  const base64 = input.replace(/^data:image\/png;base64,/, '');
  const buf = Buffer.from(base64, 'base64');
  if (buf.length > 512 * 1024) throw new PdfValidationError('Signature image is too large.');
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) throw new PdfValidationError('Signature image must be a PNG.');
  return buf;
}
