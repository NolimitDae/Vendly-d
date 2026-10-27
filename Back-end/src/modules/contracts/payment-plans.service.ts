import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BookingContractStatus, BookingStatus, ContractAuditAction, ContractSignerRole, InstallmentStatus, PaymentPlan, Prisma } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaymentsService } from 'src/modules/payments/payments.service';
import { ChatExtrasService } from 'src/modules/chat/extras/chat-extras.service';
import {
  checkCustomPlan,
  CustomPayment,
  latestDueAt,
  MAX_PLAN_PAYMENTS,
  MIN_LAST_PAYMENT,
  MIN_PLAN_PAYMENT,
  MIN_PLAN_PAYMENTS,
  PaymentPlanError,
  planDate,
  planSentence,
  readCustomPlan,
  withPaymentPlan,
} from 'src/modules/payments/custom-plan';
import { unpaidCharges } from 'src/modules/payments/custom-plan-charges';
import { money } from 'src/modules/payments/money-text';
import { AuthUser, BookingContractsService, RequestMeta, verificationCode } from './booking-contracts.service';
import { contentHash, MergeData, missingFields, missingFieldsMessage } from './contract-merge';
import { CONSENT_TEXT, CONSENT_TEXT_VERSION } from './contract-templates';
import { ResolvedVendorContract } from './vendor-contracts.service';
import { isProposal } from './request-changes';
import { PlanChange, PlanRow, proposedRows, readPlanChange } from './payment-plan-change';
import { PaymentPlanProposalDto, SendPaymentPlanDto } from './dto/payment-plans.dto';
import { SignatureDto } from './dto/contracts.dto';
import { requiredBookingFields } from 'src/modules/booking/booking-place';

const bookingInclude = {
  listing: { select: { title: true, payment_plan: true, guest_count_required: true, category: { select: { default_payment_plan: true } } } },
  vendor: { select: { id: true, name: true, email: true, vendorProfile: { select: { business_name: true } } } },
  customer: { select: { id: true, name: true, email: true, type: true } },
  installments: { orderBy: { sequence: 'asc' } },
  contracts: { orderBy: { version: 'desc' }, include: { vendor_contract: { include: { template: true } } } },
} satisfies Prisma.BookingInclude;

type PlanBooking = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;
type ContractRow = PlanBooking['contracts'][number];

const PENDING: BookingContractStatus[] = [BookingContractStatus.DRAFT, BookingContractStatus.AWAITING_CUSTOMER, BookingContractStatus.AWAITING_CLIENT, BookingContractStatus.AWAITING_VENDOR];
/** Merge data that belongs to one version only, never carried into the next. */
const OWN_KEYS = ['request_changes', 'amendment_changes', 'payment_plan_change'];

const vendorName = (b: Pick<PlanBooking, 'vendor'>) => b.vendor.vendorProfile?.business_name || b.vendor.name || 'The vendor';
const titleOf = (b: Pick<PlanBooking, 'listing'>) => b.listing?.title ?? 'your booking';

/**
 * A custom payment plan on a confirmed booking (rules in payments/custom-plan.ts): the vendor proposes a
 * schedule for the payments not made yet and signs it as an amendment of the contract; the customer signs to
 * agree (the unpaid charges are replaced, then charged on their dates) or declines (the current plan stays).
 * The vendor can withdraw it until then. On a pending request the plan goes with Suggest changes instead.
 */
@Injectable()
export class PaymentPlansService {
  private readonly logger = new Logger(PaymentPlansService.name);

  constructor(
    private prisma: PrismaService,
    private contracts: BookingContractsService,
    private payments: PaymentsService,
    private chat: ChatExtrasService,
  ) {}

  private async load(bookingId: string, user: AuthUser) {
    const b = await this.prisma.booking.findFirst({ where: { id: bookingId, deleted_at: null }, include: bookingInclude });
    if (!b) throw new NotFoundException('Booking not found');
    const role = b.vendor_id === user.userId ? 'VENDOR' : b.customer_id === user.userId ? 'CUSTOMER' : null;
    if (!role) throw new ForbiddenException('Access denied');
    return { b, role } as const;
  }

  /** The plan amendment waiting for the customer, if any. */
  private waiting(b: PlanBooking) {
    return b.contracts.find((c) => c.status === BookingContractStatus.AWAITING_CUSTOMER && !!readPlanChange(c.merge_data)) ?? null;
  }

  /** The package is paid after the service: a plan may then take payments after the event. */
  private payAfter(b: PlanBooking) {
    const listingPlan = b.listing?.payment_plan ?? b.listing?.category?.default_payment_plan;
    return b.payment_plan === PaymentPlan.PAY_AFTER_SERVICE || listingPlan === PaymentPlan.PAY_AFTER_SERVICE || !!readCustomPlan(b.custom_payment_plan)?.pay_after;
  }

  private context(b: PlanBooking, now = new Date()) {
    const charges = unpaidCharges(b.installments);
    const executed = b.contracts.find((c) => c.status === BookingContractStatus.EXECUTED) ?? null;
    const tz = ((executed?.merge_data ?? {}) as Record<string, unknown>).timezone as string | undefined;
    const ctx = { owed: charges.owed, feeOwed: charges.feeOwed, paidCount: charges.paidCount, now, eventStart: b.event_start_at ?? b.scheduled_at, eventEnd: b.event_end_at, payAfter: this.payAfter(b), timeZone: tz ?? null };
    return { ...charges, ctx, executed, latest: latestDueAt(ctx) };
  }

  /** Why the vendor can't propose a plan on this booking right now, or null. */
  private cannotPropose(b: PlanBooking, now = new Date()) {
    if (b.status === BookingStatus.PENDING) return 'On a request, add a payment plan with Suggest changes.';
    if (b.status !== BookingStatus.CONFIRMED) return 'A payment plan can be proposed while the booking is confirmed.';
    if (b.dispute_opened_at && !b.dispute_resolved_at) return 'This booking has an open dispute.';
    const c = this.context(b, now);
    if (!c.executed) return 'This booking has no signed contract, so its payment plan can’t be changed.';
    if (this.waiting(b)) return 'Your payment plan is waiting for the customer.';
    if (b.contracts.some((x) => x.supersedes_id && !isProposal(x) && PENDING.includes(x.status))) {
      return 'An amendment is waiting for a signature. You can propose a payment plan once it is signed or declined.';
    }
    if (c.inFlight) return 'A payment on this booking is going through right now. Try again in a few minutes.';
    if (c.owed <= 0) return 'Everything on this booking has been paid.';
    if (Math.round(c.owed * 100) < Math.round((MIN_PLAN_PAYMENT + MIN_LAST_PAYMENT) * 100)) return `Only ${money(c.owed)} is left to pay, which is too little to split.`;
    if (c.latest <= now) return 'It’s too late to change the payment plan of this booking.';
    return null;
  }

  /** The booking's payments as they stand: paid ones and the ones still to come (replaced ones left out). */
  private currentRows(b: PlanBooking): PlanRow[] {
    return b.installments
      .filter((i) => i.kind === 'charge' && i.status !== InstallmentStatus.CANCELLED)
      .map((i) => ({ label: i.label, amount: Number(i.amount), due_at: i.due_at.toISOString(), status: i.status }));
  }

  private check(b: PlanBooking, dto: PaymentPlanProposalDto) {
    const blocked = this.cannotPropose(b);
    if (blocked) throw new BadRequestException(blocked);
    const c = this.context(b);
    try {
      return { ...c, payments: checkCustomPlan(dto.payments, c.ctx) };
    } catch (e) {
      if (e instanceof PaymentPlanError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  /** The amendment: the signed contract as it stands, with the payment plan in its payment terms and Schedule A. */
  private amendment(b: PlanBooking, current: ContractRow, payments: CustomPayment[], paidCount: number) {
    const vc = current.vendor_contract as ResolvedVendorContract;
    const prev = Object.fromEntries(Object.entries((current.merge_data ?? {}) as Record<string, unknown>).filter(([k]) => !OWN_KEYS.includes(k))) as MergeData;
    const version = b.contracts[0].version + 1;
    const tz = prev.timezone;
    const data: MergeData = {
      ...prev,
      contract_version: String(version),
      payment_schedule: planSentence(payments, 'now', tz, b.currency),
      pricing_schedule: withPaymentPlan(prev.pricing_schedule, { payments, first: 'now', timeZone: tz, currency: b.currency, customerRole: prev.customer_role_label || 'Customer', depositPaid: paidCount > 0 }),
    };
    const rendered = this.contracts.renderFor(vc, data);
    const body = `${rendered.body}\n\n## Amendment\nThis version replaces contract version ${current.version} (verification ${current.verification_code}). Changed: payment plan. Until both parties sign this amendment, version ${current.version} and its payments remain in force.`;
    return { vc, version, data, title: rendered.title, body, content: contentHash(body, vc.file_sha256), missing: missingFields(requiredBookingFields(rendered.required, { guest_count_required: b.listing?.guest_count_required }), data) };
  }

  /** "3 payments: $2,000.00 now, $1,500.00 on Tue, Dec 1, 2026, ..." (the amendment's change line). */
  private summaryText(payments: CustomPayment[], tz?: string | null, currency?: string | null) {
    return `${payments.length} payments: ${payments.map((p) => `${money(p.amount, currency)} ${p.due_at ? `on ${planDate(p.due_at, tz)}` : 'now'}`).join(', ')}`;
  }

  private async prepare(bookingId: string, user: AuthUser, dto: PaymentPlanProposalDto) {
    const { b, role } = await this.load(bookingId, user);
    if (role !== 'VENDOR') throw new ForbiddenException('Only the vendor can propose a payment plan.');
    const c = this.check(b, dto);
    const contract = this.amendment(b, c.executed!, c.payments, c.paidCount);
    const change: PlanChange = {
      pay_after: c.ctx.payAfter,
      payments: c.payments,
      owed: c.owed,
      fee_owed: c.feeOwed,
      paid_count: c.paidCount,
      note: dto.note?.trim() || null,
      before: this.currentRows(b),
    };
    return { b, c, contract, change };
  }

  // ─── Reading ──────────────────────────────────────────────────────────────

  /** The booking's payments, the plan waiting for the customer (or the last answered), and for the vendor the editor's rules. */
  async state(bookingId: string, user: AuthUser) {
    const { b, role } = await this.load(bookingId, user);
    const latest = b.contracts.find((c) => readPlanChange(c.merge_data)) ?? null;
    const change = latest ? readPlanChange(latest.merge_data)! : null;
    const status = !latest
      ? null
      : latest.status === BookingContractStatus.AWAITING_CUSTOMER
        ? 'WAITING'
        : latest.status === BookingContractStatus.EXECUTED || latest.status === BookingContractStatus.SUPERSEDED
          ? 'APPROVED'
          : latest.status === BookingContractStatus.VOID
            ? latest.void_reason === 'Declined by vendor'
              ? 'WITHDRAWN'
              : 'DECLINED'
            : null;
    const blocked = role === 'VENDOR' ? this.cannotPropose(b) : null;
    const c = this.context(b);
    return {
      success: true,
      data: {
        role,
        plan: b.payment_plan,
        payments: this.currentRows(b),
        can_propose: role === 'VENDOR' && !blocked,
        cannot_propose_reason: blocked,
        rules:
          role === 'VENDOR'
            ? {
                owed: c.owed,
                fee_owed: c.feeOwed,
                paid_count: c.paidCount,
                min_payments: MIN_PLAN_PAYMENTS,
                max_payments: MAX_PLAN_PAYMENTS,
                min_payment: MIN_PLAN_PAYMENT,
                latest_due_at: c.latest.toISOString(),
                event_start_at: (b.event_start_at ?? b.scheduled_at)?.toISOString() ?? null,
                pay_after: c.ctx.payAfter,
              }
            : null,
        proposal:
          latest && change && status
            ? {
                contract_id: latest.id,
                version: latest.version,
                status,
                sent_at: latest.created_at,
                vendor_name: vendorName(b),
                note: change.note,
                owed: change.owed,
                before: change.before,
                after: proposedRows(change.payments),
                content_sha256: latest.content_sha256,
              }
            : null,
        consent_text: CONSENT_TEXT,
      },
    };
  }

  // ─── Vendor ───────────────────────────────────────────────────────────────

  /** The checked plan and the amendment to sign. Nothing is saved. */
  async preview(bookingId: string, user: AuthUser, dto: PaymentPlanProposalDto) {
    const p = await this.prepare(bookingId, user, dto);
    return {
      success: true,
      data: {
        before: p.change.before,
        after: proposedRows(p.change.payments),
        owed: p.change.owed,
        title: p.contract.title,
        body: p.contract.body,
        content_sha256: p.contract.content,
        version: p.contract.version,
        missing_fields: p.contract.missing,
        missing_message: p.contract.missing.length ? missingFieldsMessage(p.contract.missing) : null,
        consent_text: CONSENT_TEXT,
        consent_text_version: CONSENT_TEXT_VERSION,
      },
    };
  }

  /** Signs and sends the plan: an amendment signed by the vendor, waiting for the customer. */
  async propose(bookingId: string, user: AuthUser, dto: SendPaymentPlanDto, meta: RequestMeta) {
    const p = await this.prepare(bookingId, user, dto);
    if (p.contract.missing.length) throw new BadRequestException(missingFieldsMessage(p.contract.missing));
    if (p.contract.content !== dto.signature.content_sha256) {
      throw new ConflictException({ message: 'The plan or the contract changed since you reviewed it. Please review and sign again.', error: 'CONTRACT_CHANGED' });
    }
    const imageKey = await this.contracts.resolveVendorSignatureImage(user.userId, dto.signature);
    const current = p.c.executed!;
    const tz = p.contract.data.timezone;
    const created = await this.prisma.$transaction(async (tx) => {
      // touching the row orders this after a cancellation or another amendment running now
      const open = await tx.booking.updateMany({ where: { id: bookingId, status: BookingStatus.CONFIRMED }, data: { updated_at: new Date() } });
      if (!open.count) throw new BadRequestException('A payment plan can be proposed while the booking is confirmed.');
      const busy = await tx.bookingContract.count({ where: { booking_id: bookingId, supersedes_id: { not: null }, status: { in: PENDING } } });
      if (busy) throw new ConflictException('An amendment is already waiting for a signature.');
      const c = await tx.bookingContract.create({
        data: {
          booking_id: bookingId,
          vendor_contract_id: p.contract.vc.id,
          version: p.contract.version,
          status: BookingContractStatus.AWAITING_CUSTOMER,
          title: p.contract.title,
          rendered_body: p.contract.body,
          merge_data: { ...p.contract.data, amendment_changes: { payment_plan: this.summaryText(p.change.payments, tz, p.b.currency) }, payment_plan_change: p.change } as unknown as Prisma.InputJsonValue,
          source_pdf_key: current.source_pdf_key,
          source_pdf_sha256: current.source_pdf_sha256,
          content_sha256: p.contract.content,
          verification_code: verificationCode(),
          supersedes_id: current.id,
        },
      });
      await this.contracts.audit(tx, { booking_contract_id: c.id, actor_id: user.userId, actor_role: ContractSignerRole.VENDOR, action: ContractAuditAction.CREATED, meta, details: { amends: current.id, payment_plan: p.change as unknown as Prisma.InputJsonValue } });
      await tx.contractSignature.create({ data: this.contracts.signatureRow(c.id, user.userId, ContractSignerRole.VENDOR, dto.signature, p.contract.content, imageKey, p.b.vendor.email, meta) });
      await this.contracts.audit(tx, { booking_contract_id: c.id, actor_id: user.userId, actor_role: ContractSignerRole.VENDOR, action: ContractAuditAction.SIGNED, meta });
      return c;
    });

    const vendor = vendorName(p.b);
    const title = titleOf(p.b);
    const plan = this.summaryText(p.change.payments, tz, p.b.currency);
    void this.contracts.notify(p.b.customer_id, p.b.customer.email, p.b.customer.name, {
      subject: `${vendor} proposed a payment plan: ${title}`,
      message: `${vendor} proposed paying what’s left on ${title} in ${plan}. Review it on the booking, then sign to agree, or decline to keep your current payments.${p.change.note ? ` Their note: “${p.change.note}”` : ''}`,
      bookingId,
      contractId: created.id,
      listingTitle: title,
      ctaPath: `/bookings/${bookingId}`,
      pushData: { type: 'booking', bookingId },
    });
    await this.notice(p.b.vendor_id, p.b.customer_id, `${vendor} proposed a payment plan for ${title}. Open the booking to review it and agree or decline.`);
    return { success: true, data: { contract_id: created.id, version: created.version, before: p.change.before, after: proposedRows(p.change.payments) } };
  }

  /** The vendor takes back a plan the customer hasn't answered. The current payments stay. */
  async withdraw(bookingId: string, user: AuthUser, meta: RequestMeta) {
    const { b, role } = await this.load(bookingId, user);
    if (role !== 'VENDOR') throw new ForbiddenException('Only the vendor can withdraw their payment plan.');
    const c = this.waiting(b);
    if (!c) throw new BadRequestException('There is no payment plan waiting on this booking.');
    await this.contracts.declineAmendment(c.id, user, meta);
    const title = titleOf(b);
    void this.contracts.notify(b.customer_id, b.customer.email, b.customer.name, {
      subject: `Payment plan withdrawn: ${title}`,
      message: `${vendorName(b)} withdrew the payment plan they proposed. Your payments for ${title} stay as they were.`,
      bookingId,
      listingTitle: title,
      ctaPath: `/bookings/${bookingId}`,
      pushData: { type: 'booking', bookingId },
    });
    await this.notice(b.vendor_id, b.customer_id, `${vendorName(b)} withdrew the payment plan for ${title}. The current payments stay.`);
    return { success: true };
  }

  // ─── Customer ─────────────────────────────────────────────────────────────

  /** The customer signs the plan: the unpaid charges are replaced by its payments, and what's due now is charged. */
  async approve(bookingId: string, user: AuthUser, sig: SignatureDto, meta: RequestMeta) {
    const { b, role } = await this.load(bookingId, user);
    if (role !== 'CUSTOMER') throw new ForbiddenException('Only the customer can agree to a payment plan.');
    const c = this.waiting(b);
    if (!c) throw new BadRequestException('There is no payment plan waiting on this booking.');
    if (sig.content_sha256 !== c.content_sha256) throw new ConflictException('The contract you reviewed does not match. Please reload and sign again.');
    // executes the amendment; the charges are replaced in the same transaction (BookingContractsService.signAmendment)
    await this.contracts.signAmendment(c.id, user, sig, meta);
    // the first payment when it's "now" (and any whose date passed meanwhile); a failure goes through the usual retries
    await this.payments.chargeDueNow(bookingId).catch((e) => this.logger.error(`plan charges ${bookingId}`, e));

    const title = titleOf(b);
    const who = b.customer.name ?? 'The customer';
    void this.contracts.notify(b.vendor_id, b.vendor.email, b.vendor.name, {
      subject: `Payment plan agreed: ${title}`,
      message: `${who} signed the payment plan you proposed for ${title}. Each payment is charged on its date.`,
      bookingId,
      contractId: c.id,
      listingTitle: title,
      ctaPath: `/vendor/bookings/${bookingId}`,
      pushData: { type: 'booking', bookingId },
    });
    await this.notice(b.customer_id, b.vendor_id, `${who} agreed to the payment plan for ${title}.`);
    return { success: true, message: 'Payment plan agreed. Each payment is charged on its date with your saved card.' };
  }

  /** The customer turns the plan down: the current payments stay. */
  async decline(bookingId: string, user: AuthUser, reason: string | undefined, meta: RequestMeta) {
    const { b, role } = await this.load(bookingId, user);
    if (role !== 'CUSTOMER') throw new ForbiddenException('Only the customer can decline a payment plan.');
    const c = this.waiting(b);
    if (!c) throw new BadRequestException('There is no payment plan waiting on this booking.');
    await this.contracts.declineAmendment(c.id, user, meta);
    const why = reason?.trim() || null;
    const title = titleOf(b);
    const who = b.customer.name ?? 'The customer';
    void this.contracts.notify(b.vendor_id, b.vendor.email, b.vendor.name, {
      subject: `Payment plan declined: ${title}`,
      message: `${who} declined the payment plan you proposed${why ? ` (“${why}”)` : ''}. The payments for ${title} stay as they were.`,
      bookingId,
      listingTitle: title,
      ctaPath: `/vendor/bookings/${bookingId}`,
      pushData: { type: 'booking', bookingId },
    });
    await this.notice(b.customer_id, b.vendor_id, `${who} declined the payment plan for ${title}. The current payments stay.`);
    return { success: true, message: 'Payment plan declined. Your payments stay as they were.' };
  }

  /** A notice in the 1:1 chat; a failure never stops the booking change. */
  private async notice(senderId: string, otherId: string, text: string) {
    await this.chat.bookingNotice(senderId, otherId, text).catch((err) => this.logger.warn(`Chat notice failed: ${(err as Error).message}`));
  }
}
