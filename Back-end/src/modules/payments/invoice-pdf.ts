import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { pdfSafe } from 'src/modules/contracts/contract-pdf';
import { money, shortDate } from './money-text';

/** Everything on a booking's final invoice (built by InvoiceService.invoiceFor). */
export interface InvoiceData {
  number: string;
  issued_at: Date;
  currency: string;
  /** whose copy: the vendor's and Vendly's show the payout and commission */
  copy: 'customer' | 'vendor' | 'admin';
  booking: { id: string; title: string; status: string; event_date: Date | null; created_at: Date; completed_at: Date | null; cancelled_at: Date | null };
  /** cancelled bookings: who cancelled and why ("Cancelled by the vendor", "Double booked. Note...") */
  cancellation?: { by: string | null; reason: string | null } | null;
  customer: { name: string; email: string | null };
  vendor: { name: string; email: string | null };
  /** package, add-ons at booking, promo, add-ons and fees added later, Vendly Protection fee */
  price_lines: { label: string; amount: number }[];
  price_total: number;
  /** every charge on the booking, paid or not */
  charges: { date: Date | null; label: string; amount: number; status: string }[];
  refunds: { date: Date | null; label: string; amount: number }[];
  /** money the vendor gave back (part of the refunds, or taken off what was still owed) */
  given_back: number;
  total_charged: number;
  total_refunded: number;
  total_paid: number;
  /** the vendor's copy only */
  payout?: { vendor_part: number; commission: number; paid_out: number; held: number };
}

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const RIGHT = PAGE_W - MARGIN;
const DARK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.42, 0.42, 0.42);
const BRAND = rgb(0.43, 0.16, 0.85);

class InvoiceWriter {
  page!: PDFPage;
  y = 0;

  constructor(
    private doc: PDFDocument,
    private regular: PDFFont,
    private bold: PDFFont,
    private footer: string,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
    this.page.drawText(pdfSafe(this.footer), { x: MARGIN, y: 28, size: 8, font: this.regular, color: MUTED });
  }

  ensure(h: number) {
    if (this.y - h < MARGIN) this.newPage();
  }

  /** One line of text, cut to fit (`maxWidth`) rather than wrapped. */
  private fit(text: string, font: PDFFont, size: number, maxWidth: number) {
    let t = pdfSafe(text);
    if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
    while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > maxWidth) t = t.slice(0, -1);
    return `${t}...`;
  }

  text(text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gapAfter?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.regular;
    const lineH = size * 1.4;
    this.ensure(lineH);
    this.y -= lineH;
    this.page.drawText(this.fit(text, font, size, RIGHT - MARGIN), { x: MARGIN, y: this.y, size, font, color: opts.color ?? DARK });
    this.y -= opts.gapAfter ?? 0;
  }

  /** A label on the left, a value right-aligned; `note` is a smaller grey column in between. */
  row(label: string, value: string, opts: { bold?: boolean; note?: string; size?: number; color?: ReturnType<typeof rgb> } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.regular;
    const lineH = size * 1.55;
    this.ensure(lineH);
    this.y -= lineH;
    const v = pdfSafe(value);
    const vw = font.widthOfTextAtSize(v, size);
    this.page.drawText(v, { x: RIGHT - vw, y: this.y, size, font, color: opts.color ?? DARK });
    const noteW = opts.note ? 110 : 0;
    this.page.drawText(this.fit(label, font, size, RIGHT - MARGIN - vw - noteW - 16), { x: MARGIN, y: this.y, size, font, color: opts.color ?? DARK });
    if (opts.note) {
      const n = this.fit(opts.note, this.regular, 8, noteW - 6);
      this.page.drawText(n, { x: RIGHT - vw - noteW - 8, y: this.y, size: 8, font: this.regular, color: MUTED });
    }
  }

  heading(text: string) {
    this.gap(10);
    this.text(text, { size: 12, bold: true, color: BRAND, gapAfter: 2 });
    this.rule();
  }

  gap(h: number) {
    this.y -= h;
  }

  rule() {
    this.ensure(8);
    this.y -= 4;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: RIGHT, y: this.y }, thickness: 0.5, color: rgb(0.82, 0.82, 0.82) });
    this.y -= 2;
  }
}

/** The final invoice PDF: standard fonts only, like the contract PDFs (contracts/contract-pdf.ts). */
export async function buildInvoicePdf(inv: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`Invoice ${inv.number} - ${inv.booking.title}`));
  doc.setProducer('Vendly');
  doc.setCreator('Vendly');
  doc.setSubject(`Booking ${inv.booking.id}`);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new InvoiceWriter(doc, regular, bold, `Vendly - Invoice ${inv.number} - Booking ${inv.booking.id}`);
  const m = (n: number) => money(n, inv.currency);

  w.text('Vendly', { size: 20, bold: true, color: BRAND });
  w.text(inv.copy === 'customer' ? 'Invoice' : inv.copy === 'vendor' ? 'Invoice (vendor copy)' : 'Invoice (Vendly copy)', { size: 16, bold: true, gapAfter: 4 });
  w.row('Invoice number', inv.number);
  w.row('Issued', shortDate(inv.issued_at));
  w.row('Booking', inv.booking.title);
  w.row('Booking reference', inv.booking.id);
  if (inv.booking.event_date) w.row('Event date', shortDate(inv.booking.event_date));
  w.row('Booked on', shortDate(inv.booking.created_at));
  const status = inv.booking.status === 'CANCELLED' ? `Cancelled ${shortDate(inv.booking.cancelled_at)}` : inv.booking.status === 'COMPLETED' ? `Completed ${shortDate(inv.booking.completed_at)}` : inv.booking.status.replace('_', ' ').toLowerCase();
  w.row('Status', status);
  if (inv.cancellation?.by) w.row('Cancelled by', inv.cancellation.by);
  if (inv.cancellation?.reason) w.row('Cancellation reason', inv.cancellation.reason);
  w.row('Customer', [inv.customer.name, inv.customer.email].filter(Boolean).join(' - '));
  w.row('Vendor', [inv.vendor.name, inv.vendor.email].filter(Boolean).join(' - '));

  w.heading('Price');
  for (const l of inv.price_lines) w.row(l.label, m(l.amount));
  w.rule();
  w.row('Total', m(inv.price_total), { bold: true });

  w.heading('Charges');
  if (!inv.charges.length) w.text('No charges.', { color: MUTED });
  for (const c of inv.charges) w.row(`${c.date ? `${shortDate(c.date)}  ` : ''}${c.label}`, m(c.amount), { note: c.status });

  if (inv.refunds.length || inv.given_back > 0) {
    w.heading('Refunds');
    for (const r of inv.refunds) w.row(`${r.date ? `${shortDate(r.date)}  ` : ''}${r.label}`, m(-r.amount));
    if (inv.given_back > 0) w.row('Money given back by the vendor (included above, or taken off what was owed)', m(inv.given_back), { color: MUTED });
  }

  w.heading('Summary');
  w.row('Total charged', m(inv.total_charged));
  if (inv.total_refunded > 0) w.row('Total refunded', m(-inv.total_refunded));
  w.row('Total paid', m(inv.total_paid), { bold: true });

  if (inv.payout) {
    w.heading('Vendor payout');
    w.row('Vendor part of what was paid (after refunds, without the Vendly Protection fee)', m(inv.payout.vendor_part));
    w.row('Vendly commission', m(-inv.payout.commission));
    w.row('Paid out to the vendor', m(inv.payout.paid_out), { bold: true });
    if (inv.payout.held > 0) w.row('Still held (paid out after the job is released)', m(inv.payout.held));
  }

  w.gap(16);
  w.text('Vendly Protection fee: covers secure payment, held funds until the job is done, and Vendly support.', { size: 8, color: MUTED });
  w.text('Refunds go back to the card that paid and take 5-10 business days to show.', { size: 8, color: MUTED });
  return doc.save();
}
