import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AddOnKind, BookingExtraStatus, InstallmentStatus } from 'prisma/generated/enums';
import appConfig from 'src/config/app.config';
import { SignedUrl } from 'src/modules/contracts/private-storage';
import { PrismaService } from 'src/prisma/prisma.service';
import { buildInvoicePdf, InvoiceData } from './invoice-pdf';
import { bookingTitle, round2 } from './money-text';
import { vendorPortion } from './payments.service';
import { bookingEarnings } from './vendor-earnings';
import { describeCancelReason } from 'src/modules/booking/cancel-reasons';

/** Who cancelled, as the invoice says it. */
const CANCELLED_BY_TEXT: Record<string, string> = { CUSTOMER: 'The customer', VENDOR: 'The vendor', SYSTEM: 'Vendly (payment not made in time)', ADMIN: 'Vendly' };

export interface InvoiceViewer {
  id: string;
  type?: string | null;
}

const STATUS_TEXT: Record<string, string> = {
  PAID: 'Paid',
  REFUNDED: 'Refunded',
  FAILED: 'Failed',
  SCHEDULED: 'Scheduled',
  CANCELLED: 'Not charged',
};

/** "Package: $45.00 per person x 120 guests" from the contract's Schedule A, when it has one. */
function packageLabel(schedule: unknown): string | null {
  if (typeof schedule !== 'string') return null;
  const line = schedule.split('\n').find((l) => l.startsWith('- Package: '));
  if (!line) return null;
  const text = line.slice('- Package: '.length);
  const eq = text.lastIndexOf(' = ');
  // "Package: $1,200.00" (no breakdown) says nothing more than the amount
  return eq > 0 ? text.slice(0, eq) : null;
}

/** INV-7F3K2Q9A: stable per booking. */
export const invoiceNumber = (bookingId: string) => `INV-${bookingId.slice(-8).toUpperCase()}`;

/**
 * The final invoice for a booking: what was agreed (package, add-ons, promo, later add-ons and fees,
 * Vendly Protection fee), every charge, refunds, money given back and the total paid; the vendor's
 * (and Vendly's) copy adds the payout and commission.
 */
@Injectable()
export class InvoiceService {
  constructor(private prisma: PrismaService) {}

  async invoiceFor(bookingId: string, viewer: InvoiceViewer): Promise<InvoiceData> {
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId },
      select: {
        id: true, status: true, customer_id: true, vendor_id: true, amount: true, service_fee: true, discount: true, promo_code: true, currency: true,
        created_at: true, completed_at: true, cancelled_at: true, event_start_at: true, scheduled_at: true,
        cancelled_by: true, cancel_reason_code: true, cancel_reason: true,
        paid_at: true, released_at: true, payout_credited_at: true, commission_amount: true, released_gross: true, early_released_amount: true,
        listing: { select: { title: true } },
        rental_reservations: { select: { item: { select: { title: true } } } },
        customer: { select: { name: true, email: true } },
        vendor: { select: { name: true, email: true, vendorProfile: { select: { business_name: true } } } },
        installments: { orderBy: { sequence: 'asc' }, include: { extra: { select: { kind: true } } } },
        extras: { where: { status: { in: [BookingExtraStatus.INCLUDED, BookingExtraStatus.APPROVED] } }, orderBy: { created_at: 'asc' }, select: { kind: true, name: true, amount: true, fee_amount: true, status: true } },
        contracts: { orderBy: { version: 'desc' }, take: 1, select: { merge_data: true } },
      },
    });
    if (!b) throw new NotFoundException('Booking not found');
    let copy: InvoiceData['copy'];
    if (b.customer_id === viewer.id) copy = 'customer';
    else if (b.vendor_id === viewer.id) copy = 'vendor';
    else if (viewer.type === 'ADMIN') copy = 'admin';
    else throw new ForbiddenException('Access denied');

    const paidRows = b.installments.filter((i) => i.status === InstallmentStatus.PAID || i.status === InstallmentStatus.REFUNDED);
    const legacy = !b.installments.length;
    if (!b.paid_at && !paidRows.length) throw new BadRequestException('There are no payments on this booking yet.');
    const currency = b.currency ?? 'usd';
    const title = bookingTitle(b);

    // ── what was agreed ────────────────────────────────────────────────────
    const included = b.extras.filter((e) => e.status === BookingExtraStatus.INCLUDED);
    const later = b.extras.filter((e) => e.status === BookingExtraStatus.APPROVED);
    const discount = round2(Number(b.discount ?? 0));
    const merge = (b.contracts[0]?.merge_data ?? null) as Record<string, unknown> | null;
    const pkgAmount = round2(Number(b.amount ?? 0) + discount - included.reduce((s, e) => s + Number(e.amount), 0));
    const lines: InvoiceData['price_lines'] = [];
    const pkg = packageLabel(merge?.pricing_schedule);
    lines.push({ label: b.listing ? `Package: ${b.listing.title}${pkg ? ` (${pkg})` : ''}` : `Rental: ${title}`, amount: pkgAmount });
    for (const e of included) lines.push({ label: `${e.kind === AddOnKind.FEE ? 'Fee' : 'Add-on'}: ${e.name}`, amount: round2(Number(e.amount)) });
    if (discount > 0) lines.push({ label: `Promo${b.promo_code ? ` ${b.promo_code}` : ''}`, amount: -discount });
    for (const e of later) lines.push({ label: `${e.kind === AddOnKind.FEE ? 'Fee' : 'Add-on'} added later: ${e.name}`, amount: round2(Number(e.amount)) });
    // rental damage / late fees: charged straight from the return (no add-on request behind them)
    for (const i of paidRows.filter((r) => r.kind === 'security_deposit' || (r.kind === 'extra' && !r.extra))) {
      lines.push({ label: i.label, amount: round2(Number(i.amount)) });
    }
    const protection = round2(Number(b.service_fee ?? 0) + later.reduce((s, e) => s + Number(e.fee_amount), 0));
    if (protection > 0) lines.push({ label: 'Vendly Protection fee', amount: protection });
    const priceTotal = round2(lines.reduce((s, l) => s + l.amount, 0));

    // ── what happened ──────────────────────────────────────────────────────
    const charges: InvoiceData['charges'] = legacy
      ? b.paid_at
        ? [{ date: b.paid_at, label: 'Payment', amount: round2(Number(b.amount ?? 0) + Number(b.service_fee ?? 0)), status: 'Paid' }]
        : []
      : b.installments.map((i) => ({
          date: i.paid_at ?? i.due_at,
          label: i.label,
          amount: round2(Number(i.amount)),
          status: i.status === InstallmentStatus.PROCESSING ? (i.capture_manually ? 'Card hold' : 'Processing') : Number(i.refunded_amount) > 0 && i.status === InstallmentStatus.PAID ? 'Paid, part refunded' : STATUS_TEXT[i.status] ?? i.status,
        }));
    let refunds: InvoiceData['refunds'] = b.installments
      .filter((i) => Number(i.refunded_amount) > 0)
      .map((i) => ({ date: i.updated_at, label: `Refund of ${i.label.toLowerCase()}`, amount: round2(Number(i.refunded_amount)) }));
    if (legacy) {
      const rows = await this.prisma.paymentTransaction.findMany({ where: { type: 'booking_refund', status: 'refunded', order_id: b.id }, select: { created_at: true, amount: true } });
      refunds = rows.map((r) => ({ date: r.created_at, label: 'Refund', amount: round2(Number(r.amount ?? 0)) }));
    }
    const givenBack = await this.prisma.paymentTransaction.aggregate({ where: { type: 'vendor_give_back', reference_number: b.id }, _sum: { amount: true } });
    const totalCharged = round2(legacy ? (b.paid_at ? Number(b.amount ?? 0) + Number(b.service_fee ?? 0) : 0) : paidRows.reduce((s, i) => s + Number(i.amount), 0));
    const totalRefunded = round2(refunds.reduce((s, r) => s + r.amount, 0));

    const inv: InvoiceData = {
      number: invoiceNumber(b.id),
      issued_at: new Date(),
      currency,
      copy,
      booking: { id: b.id, title, status: b.status, event_date: b.event_start_at ?? b.scheduled_at, created_at: b.created_at, completed_at: b.completed_at, cancelled_at: b.cancelled_at },
      cancellation:
        b.status === 'CANCELLED'
          ? { by: b.cancelled_by ? CANCELLED_BY_TEXT[b.cancelled_by] ?? null : null, reason: describeCancelReason(b) }
          : null,
      customer: { name: b.customer?.name ?? 'Customer', email: b.customer?.email ?? null },
      vendor: { name: b.vendor?.vendorProfile?.business_name || b.vendor?.name || 'Vendor', email: b.vendor?.email ?? null },
      price_lines: lines,
      price_total: priceTotal,
      charges,
      refunds,
      given_back: round2(Number(givenBack?._sum?.amount ?? 0)),
      total_charged: totalCharged,
      total_refunded: totalRefunded,
      total_paid: round2(totalCharged - totalRefunded),
    };

    if (copy !== 'customer') {
      // the same figures as the earnings page (payments/vendor-earnings.ts)
      const e = bookingEarnings({ ...b, installments: b.installments });
      const vendorPart = legacy ? (b.paid_at && b.status !== 'CANCELLED' ? round2(Number(b.amount ?? 0)) : 0) : round2(paidRows.reduce((s, i) => s + vendorPortion(i), 0));
      inv.payout = { vendor_part: vendorPart, commission: e.commission, paid_out: e.earned, held: e.held };
    }
    return inv;
  }

  async pdfFor(bookingId: string, viewer: InvoiceViewer) {
    const inv = await this.invoiceFor(bookingId, viewer);
    return { buffer: Buffer.from(await buildInvoicePdf(inv)), name: `vendly-invoice-${inv.number}.pdf` };
  }

  /** A short-lived link that opens the PDF without a login header (mobile opens it in the browser). */
  async linkFor(bookingId: string, viewer: InvoiceViewer) {
    // checks access (and that there is something to invoice) before handing out a link
    const inv = await this.invoiceFor(bookingId, viewer);
    const name = `vendly-invoice-${inv.number}.pdf`;
    const base = appConfig().app.url ?? '';
    return { success: true, data: { url: `${base}/api/invoices/${SignedUrl.sign({ key: `invoice:${bookingId}`, uid: viewer.id, cid: bookingId, name })}` } };
  }

  /** Serves the PDF for a link from linkFor; the viewer's role is checked again now. */
  async resolveLink(token: string) {
    const claims = SignedUrl.verify(token);
    if (!claims || !claims.key.startsWith('invoice:')) throw new ForbiddenException('This download link has expired.');
    const user = await this.prisma.user.findUnique({ where: { id: claims.uid }, select: { id: true, type: true, deleted_at: true, status: true } });
    // the account must still be active (as for a login: not deleted, not suspended)
    if (!user || user.deleted_at || user.status === 0) throw new ForbiddenException('This download link has expired.');
    return this.pdfFor(claims.key.slice('invoice:'.length), { id: user.id, type: user.type });
  }
}
