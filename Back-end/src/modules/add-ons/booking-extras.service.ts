import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AddOnKind, AddOnPriceUnit, BookingExtraStatus, BookingStatus, InstallmentStatus, Prisma } from 'prisma/generated/client';
import { withJobLock } from 'src/common/helper/job-lock';
import { track } from 'src/common/analytics';
import appConfig from 'src/config/app.config';
import { MailService } from 'src/mail/mail.service';
import { PaymentsService } from 'src/modules/payments/payments.service';
import { currentFees } from 'src/modules/platform/platform-settings.service';
import { PushService } from 'src/modules/push/push.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { RequestExtraDto } from './dto/add-ons.dto';
import { addOnLabel, extraProtectionFee, round2 } from './pricing';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
/** Fees and add-ons can be requested for this long after the job is marked complete. */
export const EXTRA_WINDOW_DAYS = 14;
/** A fee the customer hasn't answered can be sent to Vendly after this long. */
export const ESCALATE_AFTER_HOURS = 72;
/** One reminder to the customer after this long. */
const REMIND_AFTER_HOURS = 24;
/** At most this many requests waiting on the customer at once. */
const MAX_OPEN = 10;
/** One request can't be more than this. */
const MAX_AMOUNT = 25_000;

const KIND_WORD: Record<AddOnKind, string> = { ADD_ON: 'add-on', FEE: 'fee' };

type ExtraRow = Prisma.BookingExtraGetPayload<{ include: { installment: true } }>;

export function formatExtra(e: ExtraRow | Prisma.BookingExtraGetPayload<{}>) {
  const inst = (e as ExtraRow).installment ?? null;
  return {
    id: e.id,
    kind: e.kind,
    name: e.name,
    description: e.description,
    label: addOnLabel(e.name, e.price_unit, Number(e.unit_price), Number(e.quantity)),
    unit_price: Number(e.unit_price),
    price_unit: e.price_unit,
    quantity: Number(e.quantity),
    amount: Number(e.amount),
    fee_amount: Number(e.fee_amount),
    total: round2(Number(e.amount) + Number(e.fee_amount)),
    note: e.note,
    status: e.status,
    created_at: e.created_at,
    responded_at: e.responded_at,
    decline_reason: e.decline_reason,
    review_requested_at: e.review_requested_at,
    review_note: e.review_note,
    reviewed_at: e.reviewed_at,
    can_escalate_at: e.kind === AddOnKind.FEE && e.status === BookingExtraStatus.PENDING ? new Date(e.created_at.getTime() + ESCALATE_AFTER_HOURS * HOUR) : null,
    payment: inst
      ? { installment_id: inst.id, status: inst.status, paid_at: inst.paid_at, last_error: inst.last_error, refunded_amount: Number(inst.refunded_amount) }
      : null,
  };
}

@Injectable()
export class BookingExtrasService {
  private readonly logger = new Logger(BookingExtrasService.name);

  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
    private mail: MailService,
    private push: PushService,
  ) {}

  private async loadBooking(bookingId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true, status: true, vendor_id: true, customer_id: true, completed_at: true, guest_count: true, currency: true, payment_method_id: true,
        dispute_opened_at: true, dispute_resolved_at: true,
        listing: { select: { title: true, category_id: true } },
        customer: { select: { id: true, name: true, email: true } },
        vendor: { select: { id: true, name: true, email: true, vendorProfile: { select: { business_name: true } } } },
      },
    });
    if (!b) throw new NotFoundException('Booking not found');
    return b;
  }

  private vendorName(b: Awaited<ReturnType<BookingExtrasService['loadBooking']>>) {
    return b.vendor.vendorProfile?.business_name || b.vendor.name || 'Your vendor';
  }

  private notify(user: { id: string; email: string | null; name: string | null }, bookingId: string, title: string, subject: string, body: string, listingTitle: string, amount?: number) {
    void this.push.sendToUser(user.id, { title, body, data: { type: 'booking', bookingId } });
    if (user.email) {
      void this.mail
        .sendBookingNotification({ to: user.email, recipientName: user.name ?? '', subject, message: body, status: 'EXTRA', listingTitle, amount, ctaUrl: `${appConfig().app.client_app_url}/bookings/${bookingId}` })
        .catch(() => null);
    }
  }

  // ─── Listing ───────────────────────────────────────────────────────────────

  async list(bookingId: string, userId: string, isAdmin = false) {
    const b = await this.loadBooking(bookingId);
    if (!isAdmin && b.customer_id !== userId && b.vendor_id !== userId) throw new ForbiddenException('Access denied');
    const rows = await this.prisma.bookingExtra.findMany({ where: { booking_id: bookingId }, include: { installment: true }, orderBy: { created_at: 'asc' } });
    const data = rows.map(formatExtra);
    const waiting = data.filter((e) => e.status === BookingExtraStatus.PENDING);
    return {
      success: true,
      data,
      meta: {
        waiting_on_customer: waiting.length,
        waiting_total: round2(waiting.reduce((s, e) => s + e.total, 0)),
        can_request: this.requestWindow(b),
      },
    };
  }

  /** Which kinds the vendor can request on this booking right now. */
  private requestWindow(b: { status: BookingStatus; completed_at: Date | null; dispute_opened_at: Date | null; dispute_resolved_at: Date | null }) {
    if (b.dispute_opened_at && !b.dispute_resolved_at) return { add_on: false, fee: false };
    const recentlyDone = b.status === BookingStatus.COMPLETED && !!b.completed_at && Date.now() - b.completed_at.getTime() <= EXTRA_WINDOW_DAYS * DAY;
    return {
      add_on: b.status === BookingStatus.CONFIRMED || b.status === BookingStatus.IN_PROGRESS || recentlyDone,
      // fees are for what happened during the job, so they start once it has
      fee: b.status === BookingStatus.IN_PROGRESS || recentlyDone,
    };
  }

  // ─── Vendor ────────────────────────────────────────────────────────────────

  async request(bookingId: string, vendorId: string, dto: RequestExtraDto) {
    const b = await this.loadBooking(bookingId);
    if (b.vendor_id !== vendorId) throw new ForbiddenException('Access denied');
    const window = this.requestWindow(b);
    if (b.dispute_opened_at && !b.dispute_resolved_at) throw new BadRequestException('This booking has an open dispute. Vendly will settle it first.');
    if (dto.kind === AddOnKind.FEE && !window.fee) {
      throw new BadRequestException(
        b.status === BookingStatus.CONFIRMED
          ? 'Fees can be requested once the job has started.'
          : `Fees can be requested during the job and up to ${EXTRA_WINDOW_DAYS} days after it’s complete.`,
      );
    }
    if (dto.kind === AddOnKind.ADD_ON && !window.add_on) {
      throw new BadRequestException(`Add-ons can be added once the booking is confirmed, and up to ${EXTRA_WINDOW_DAYS} days after it’s complete.`);
    }
    const open = await this.prisma.bookingExtra.count({ where: { booking_id: bookingId, status: BookingExtraStatus.PENDING } });
    if (open >= MAX_OPEN) throw new BadRequestException('The customer has several requests to answer already. Wait for them to respond first.');

    const lib = dto.add_on_id
      ? await this.prisma.vendorAddOn.findFirst({ where: { id: dto.add_on_id, vendor_id: vendorId, deleted_at: null } })
      : null;
    if (dto.add_on_id && !lib) throw new NotFoundException('That add-on wasn’t found.');
    if (lib && lib.kind !== dto.kind) throw new BadRequestException(`That item is ${lib.kind === AddOnKind.FEE ? 'a fee' : 'an add-on'}.`);
    const name = (dto.name ?? lib?.name ?? '').trim();
    if (name.length < 2) throw new BadRequestException('Give it a name the customer will recognise.');
    const unitPrice = round2(Number(dto.unit_price ?? lib?.price ?? 0));
    if (!(unitPrice > 0)) throw new BadRequestException('Enter a price.');
    const unit = dto.price_unit ?? lib?.price_unit ?? AddOnPriceUnit.FIXED;
    // per person defaults to the booking's guests; anything else defaults to one
    const quantity = round2(Number(dto.quantity ?? (unit === AddOnPriceUnit.PER_PERSON ? b.guest_count ?? 0 : 1)));
    if (!(quantity > 0)) throw new BadRequestException(unit === AddOnPriceUnit.PER_PERSON ? 'Enter how many guests this is for.' : 'Enter a quantity.');
    if (unit !== AddOnPriceUnit.PER_HOUR && !Number.isInteger(quantity)) throw new BadRequestException('Only hours can be a fraction (like 1.5).');
    if (unit === AddOnPriceUnit.PER_ITEM && lib?.max_quantity && quantity > lib.max_quantity) throw new BadRequestException(`Up to ${lib.max_quantity} of “${name}”.`);
    const amount = round2(unitPrice * quantity);
    if (amount < 1) throw new BadRequestException('A request must be at least $1.00.');
    if (amount > MAX_AMOUNT) throw new BadRequestException(`A single request can be up to $${MAX_AMOUNT.toLocaleString('en-US')}. Contact Vendly support for more.`);
    // the customer pays the Vendly Protection fee on add-ons as on the booking; fees carry none
    const percent = (b.listing?.category_id && currentFees().categories.get(b.listing.category_id)) ?? currentFees().percent;
    const fee = dto.kind === AddOnKind.ADD_ON ? extraProtectionFee(amount, percent) : 0;

    const extra = await this.prisma.bookingExtra.create({
      data: {
        booking_id: bookingId,
        add_on_id: lib?.id ?? null,
        kind: dto.kind,
        name,
        description: lib?.description ?? null,
        unit_price: unitPrice,
        price_unit: unit,
        quantity,
        amount,
        fee_amount: fee,
        note: dto.note?.trim() || null,
        status: BookingExtraStatus.PENDING,
      },
    });
    const title = b.listing?.title ?? 'your booking';
    const what = addOnLabel(name, unit, unitPrice, quantity);
    const total = round2(amount + fee);
    this.notify(
      b.customer,
      bookingId,
      dto.kind === AddOnKind.FEE ? 'A fee needs your approval' : 'An add-on needs your approval',
      `Approve ${KIND_WORD[dto.kind]}: ${name} — ${title}`,
      `${this.vendorName(b)} sent ${dto.kind === AddOnKind.FEE ? 'a fee' : 'an add-on'} for ${title}: ${what}, $${total.toFixed(2)}${extra.note ? ` (${extra.note})` : ''}. Nothing is charged until you approve it.`,
      title,
      total,
    );
    track('booking_extra_requested', vendorId, { booking_id: bookingId, kind: dto.kind, amount });
    return { success: true, data: formatExtra(extra) };
  }

  /** The vendor withdraws a request the customer hasn't paid. */
  async withdraw(extraId: string, vendorId: string) {
    const e = await this.prisma.bookingExtra.findUnique({ where: { id: extraId }, include: { booking: { select: { vendor_id: true, customer_id: true } } } });
    if (!e) throw new NotFoundException('Request not found');
    if (e.booking.vendor_id !== vendorId) throw new ForbiddenException('Access denied');
    const done = await this.prisma.bookingExtra.updateMany({
      where: { id: extraId, status: { in: [BookingExtraStatus.PENDING, BookingExtraStatus.DECLINED, BookingExtraStatus.IN_REVIEW] } },
      data: { status: BookingExtraStatus.CANCELLED },
    });
    if (done.count !== 1) throw new BadRequestException('Only a request that hasn’t been paid can be withdrawn.');
    if (e.status === BookingExtraStatus.PENDING) {
      void this.push.sendToUser(e.booking.customer_id, { title: 'Request withdrawn', body: `The vendor withdrew “${e.name}”. You won’t be charged for it.`, data: { type: 'booking', bookingId: e.booking_id } });
    }
    return { success: true };
  }

  /** A declined (or unanswered) fee goes to Vendly to decide under the contract. */
  async escalate(extraId: string, vendorId: string, note: string) {
    const e = await this.prisma.bookingExtra.findUnique({ where: { id: extraId } });
    if (!e) throw new NotFoundException('Request not found');
    const b = await this.loadBooking(e.booking_id);
    if (b.vendor_id !== vendorId) throw new ForbiddenException('Access denied');
    if (e.kind !== AddOnKind.FEE) throw new BadRequestException('Only fees can be sent to Vendly. The customer decides on add-ons.');
    const unanswered = e.status === BookingExtraStatus.PENDING && Date.now() - e.created_at.getTime() >= ESCALATE_AFTER_HOURS * HOUR;
    if (e.status !== BookingExtraStatus.DECLINED && !unanswered) {
      throw new BadRequestException(
        e.status === BookingExtraStatus.PENDING
          ? `The customer has ${ESCALATE_AFTER_HOURS} hours to answer. You can ask Vendly to review it after that.`
          : 'This fee can’t be sent for review.',
      );
    }
    const done = await this.prisma.bookingExtra.updateMany({
      where: { id: extraId, status: e.status },
      data: { status: BookingExtraStatus.IN_REVIEW, review_requested_at: new Date(), review_note: note.trim() },
    });
    if (done.count !== 1) throw new BadRequestException('This fee changed. Please refresh.');
    const title = b.listing?.title ?? 'your booking';
    this.notify(
      b.customer,
      e.booking_id,
      'Vendly is reviewing a fee',
      `Vendly is reviewing a fee — ${title}`,
      `${this.vendorName(b)} asked Vendly to review the ${e.name} fee ($${Number(e.amount).toFixed(2)}) on ${title}. Their reason: ${note.trim()}. We’ll look at the contract and the booking and let you both know. You can add your side by replying to this email.`,
      title,
      Number(e.amount),
    );
    track('booking_extra_escalated', vendorId, { booking_id: e.booking_id, extra_id: extraId });
    return { success: true };
  }

  // ─── Customer ──────────────────────────────────────────────────────────────

  async approve(extraId: string, customerId: string, paymentMethodId?: string) {
    const e = await this.prisma.bookingExtra.findUnique({ where: { id: extraId } });
    if (!e) throw new NotFoundException('Request not found');
    const b = await this.loadBooking(e.booking_id);
    if (b.customer_id !== customerId) throw new ForbiddenException('Access denied');
    if (e.status !== BookingExtraStatus.PENDING) throw new BadRequestException('This request has already been answered.');
    if (b.status === BookingStatus.CANCELLED || b.status === BookingStatus.REJECTED) throw new BadRequestException('This booking has ended.');
    if (b.dispute_opened_at && !b.dispute_resolved_at) throw new BadRequestException('This booking has an open dispute. Vendly will settle it first.');
    const card = paymentMethodId ?? b.payment_method_id;
    if (!card) throw new BadRequestException('Add a card to pay for this.');
    if (paymentMethodId) await this.payments.assertOwnsCard(customerId, paymentMethodId);

    const result = await this.chargeFor(e.id, BookingExtraStatus.PENDING, card, { responded_at: new Date() });
    const title = b.listing?.title ?? 'the booking';
    this.notify(
      b.vendor,
      e.booking_id,
      `${e.kind === AddOnKind.FEE ? 'Fee' : 'Add-on'} approved`,
      `${e.name} approved — ${title}`,
      `${b.customer.name ?? 'The customer'} approved ${e.name} ($${Number(e.amount).toFixed(2)}) on ${title}.${result.paid ? ' It has been paid and will reach you with your payout.' : ' We’re taking the payment now.'}`,
      title,
      Number(e.amount),
    );
    track('booking_extra_approved', customerId, { booking_id: e.booking_id, kind: e.kind, paid: result.paid });
    return { success: true, data: result };
  }

  async decline(extraId: string, customerId: string, reason?: string) {
    const e = await this.prisma.bookingExtra.findUnique({ where: { id: extraId } });
    if (!e) throw new NotFoundException('Request not found');
    const b = await this.loadBooking(e.booking_id);
    if (b.customer_id !== customerId) throw new ForbiddenException('Access denied');
    const done = await this.prisma.bookingExtra.updateMany({
      where: { id: extraId, status: BookingExtraStatus.PENDING },
      data: { status: BookingExtraStatus.DECLINED, responded_at: new Date(), decline_reason: reason?.trim() || null },
    });
    if (done.count !== 1) throw new BadRequestException('This request has already been answered.');
    const title = b.listing?.title ?? 'the booking';
    const why = reason?.trim() ? ` Their reason: ${reason.trim()}.` : '';
    const next = e.kind === AddOnKind.FEE ? ' If the fee is owed under your contract, you can ask Vendly to review it from the booking.' : '';
    this.notify(b.vendor, e.booking_id, `${e.kind === AddOnKind.FEE ? 'Fee' : 'Add-on'} declined`, `${e.name} declined — ${title}`, `${b.customer.name ?? 'The customer'} declined ${e.name} ($${Number(e.amount).toFixed(2)}) on ${title}.${why}${next}`, title);
    track('booking_extra_declined', customerId, { booking_id: e.booking_id, kind: e.kind });
    return { success: true };
  }

  /**
   * Claims the request (from `from`) as APPROVED, adds it as an installment and charges it. A card
   * that fails goes through the usual retry and "Payment problem" flow.
   */
  private async chargeFor(extraId: string, from: BookingExtraStatus, paymentMethodId: string | null, extraData: Prisma.BookingExtraUpdateManyMutationInput = {}) {
    const e = await this.prisma.bookingExtra.findUniqueOrThrow({ where: { id: extraId } });
    const claimed = await this.prisma.bookingExtra.updateMany({ where: { id: extraId, status: from }, data: { status: BookingExtraStatus.APPROVED, ...extraData } });
    if (claimed.count !== 1) throw new BadRequestException('This request has already been answered.');
    const inst = await this.prisma.$transaction(async (tx) => {
      const last = await tx.bookingInstallment.findFirst({ where: { booking_id: e.booking_id }, orderBy: { sequence: 'desc' }, select: { sequence: true, currency: true } });
      const row = await tx.bookingInstallment.create({
        data: {
          booking_id: e.booking_id,
          sequence: (last?.sequence ?? 0) + 1,
          label: `${e.kind === AddOnKind.FEE ? 'Fee' : 'Add-on'}: ${e.name}`.slice(0, 100),
          amount: round2(Number(e.amount) + Number(e.fee_amount)),
          fee_amount: e.fee_amount,
          currency: last?.currency ?? 'usd',
          due_at: new Date(),
          kind: 'extra',
        },
      });
      await tx.bookingExtra.update({ where: { id: extraId }, data: { installment_id: row.id } });
      return row;
    });
    const charged = await this.payments.chargeInstallment(inst.id, paymentMethodId ?? undefined).catch((err) => {
      this.logger.error(`charge extra ${extraId}`, err);
      return null;
    });
    const paid = charged?.status === InstallmentStatus.PAID;
    // paid after the booking's payout: send the vendor their share now rather than at the next sweep
    if (paid) void this.payments.payOutLateFor(e.booking_id).catch((err) => this.logger.error(`late payout ${e.booking_id}`, err));
    const fresh = await this.prisma.bookingExtra.findUniqueOrThrow({ where: { id: extraId }, include: { installment: true } });
    return { ...formatExtra(fresh), paid };
  }

  // ─── Vendly review (admin) ─────────────────────────────────────────────────

  async adminList(status: 'open' | 'done' = 'open') {
    const rows = await this.prisma.bookingExtra.findMany({
      where: status === 'open' ? { status: BookingExtraStatus.IN_REVIEW } : { review_requested_at: { not: null }, status: { not: BookingExtraStatus.IN_REVIEW } },
      include: {
        installment: true,
        booking: {
          select: {
            id: true, status: true, completed_at: true, amount: true, currency: true,
            listing: { select: { title: true } },
            customer: { select: { id: true, name: true, email: true } },
            vendor: { select: { id: true, name: true, email: true } },
            proofs: { select: { id: true }, take: 1 },
          },
        },
      },
      orderBy: { review_requested_at: 'asc' },
      take: 200,
    });
    return {
      success: true,
      data: rows.map((r) => ({
        ...formatExtra(r),
        booking: { ...r.booking, amount: r.booking.amount != null ? Number(r.booking.amount) : null, has_proof: r.booking.proofs.length > 0, proofs: undefined },
      })),
    };
  }

  async adminReview(extraId: string, adminId: string, input: { action: 'charge' | 'waive'; note: string }) {
    const e = await this.prisma.bookingExtra.findUnique({ where: { id: extraId } });
    if (!e) throw new NotFoundException('Request not found');
    if (e.status !== BookingExtraStatus.IN_REVIEW) throw new BadRequestException('This fee isn’t waiting for review.');
    const b = await this.loadBooking(e.booking_id);
    const title = b.listing?.title ?? 'the booking';
    const reviewed = { reviewed_at: new Date(), reviewed_by: adminId, review_note: `${e.review_note ?? ''}\n\nVendly: ${input.note.trim()}`.trim() };
    let paid = false;
    if (input.action === 'charge') {
      if (!b.payment_method_id) throw new BadRequestException('The customer has no card on this booking. Waive it or contact them.');
      const r = await this.chargeFor(extraId, BookingExtraStatus.IN_REVIEW, b.payment_method_id, reviewed);
      paid = r.paid;
    } else {
      const done = await this.prisma.bookingExtra.updateMany({ where: { id: extraId, status: BookingExtraStatus.IN_REVIEW }, data: { status: BookingExtraStatus.WAIVED, ...reviewed } });
      if (done.count !== 1) throw new BadRequestException('This fee changed. Please refresh.');
    }
    const outcome =
      input.action === 'charge'
        ? `Vendly reviewed the ${e.name} fee ($${Number(e.amount).toFixed(2)}) on ${title} and found it is owed under the contract, so it has been charged to the card on the booking. ${input.note.trim()}`
        : `Vendly reviewed the ${e.name} fee ($${Number(e.amount).toFixed(2)}) on ${title} and decided it won’t be charged. ${input.note.trim()}`;
    for (const who of [b.customer, b.vendor]) this.notify(who, e.booking_id, 'Fee review finished', `Fee review: ${e.name} — ${title}`, outcome, title);
    track('booking_extra_reviewed', adminId, { booking_id: e.booking_id, action: input.action, paid });
    return { success: true, data: { action: input.action, paid } };
  }

  // ─── Reminders ─────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  cronReminders() {
    return withJobLock(this.prisma, 'extra-reminders', () => this.remind());
  }

  /** One nudge to the customer for requests left unanswered for a day. */
  async remind(now = new Date()) {
    const due = await this.prisma.bookingExtra.findMany({
      where: { status: BookingExtraStatus.PENDING, reminded_at: null, created_at: { lte: new Date(now.getTime() - REMIND_AFTER_HOURS * HOUR) } },
      select: { id: true, booking_id: true, name: true, kind: true, amount: true, fee_amount: true },
      take: 200,
    });
    for (const e of due) {
      const claimed = await this.prisma.bookingExtra.updateMany({ where: { id: e.id, reminded_at: null }, data: { reminded_at: now } });
      if (claimed.count !== 1) continue;
      const b = await this.loadBooking(e.booking_id).catch(() => null);
      if (!b) continue;
      const title = b.listing?.title ?? 'your booking';
      const total = round2(Number(e.amount) + Number(e.fee_amount));
      this.notify(
        b.customer,
        e.booking_id,
        'Still waiting for your answer',
        `Reminder: ${e.name} — ${title}`,
        `${this.vendorName(b)} is waiting for your answer on ${e.name} ($${total.toFixed(2)}) for ${title}. Approve or decline it from the booking.${e.kind === AddOnKind.FEE ? ` Fees left unanswered for ${ESCALATE_AFTER_HOURS} hours can be sent to Vendly to review.` : ''}`,
        title,
        total,
      );
    }
    return due.length;
  }
}
