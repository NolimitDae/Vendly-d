import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AddOnKind, BookingContractStatus, BookingExtraStatus, BookingStatus, ContractAuditAction, ContractSignerRole, PaymentPlan, Prisma } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { AddOnsService } from 'src/modules/add-ons/add-ons.service';
import { PackageOptionsService, formatOptionGroups, OPTION_GROUPS_INCLUDE } from 'src/modules/add-ons/package-options.service';
import { ChosenGroup, optionScheduleLines, priceOptionChoices, readChosenOptions, UnitBasis } from 'src/modules/add-ons/package-options';
import { AddOnUnit, EventInput, packageUnit, PricingError, round2 } from 'src/modules/add-ons/pricing';
import { needsGuestCount } from 'src/modules/booking/booking-place';
import { requestExpiresAt } from 'src/modules/booking/booking-requests';
import { buildSchedule } from 'src/modules/payments/payment-schedule';
import { platformServiceFee } from 'src/modules/platform/platform-settings.service';
import { promoDiscount } from 'src/modules/platform/promo.service';
import { ChatExtrasService } from 'src/modules/chat/extras/chat-extras.service';
import { AuthUser, BookingContractsService, RequestMeta, verificationCode } from './booking-contracts.service';
import { buildMergeData, buildPricingSchedule, contentHash, MergeData, missingFields, missingFieldsMessage } from './contract-merge';
import { CONSENT_TEXT, CONSENT_TEXT_VERSION } from './contract-templates';
import { ResolvedVendorContract } from './vendor-contracts.service';
import { ProposalDto, SendProposalDto } from './dto/request-changes.dto';
import { SignatureDto } from './dto/contracts.dto';
import {
  CatalogItem,
  describeChanges,
  ExistingLine,
  lineLabel,
  MAX_PROPOSAL_PRICE,
  packageAsRequested,
  packageForProposal,
  pairLines,
  priceProposalLines,
  ProposalData,
  quoteBasis,
  readProposal,
  reopenedAt,
  RequestChangeError,
  RequestTerms,
  sameTerms,
  suggestedTimes,
  withChosenPrices,
} from './request-changes';

/** The request as this service loads it. */
const bookingInclude = {
  listing: { include: { category: { select: { name: true, default_payment_plan: true } } } },
  vendor: { select: { id: true, name: true, email: true, vendorProfile: { select: { business_name: true, address: true } } } },
  customer: { select: { id: true, name: true, email: true, type: true } },
  extras: { where: { status: BookingExtraStatus.INCLUDED }, orderBy: { created_at: 'asc' } },
  event_bookings: { include: { event: { select: { id: true, name: true, venue: true, guest_count: true } } } },
  contracts: { orderBy: { version: 'desc' }, include: { vendor_contract: { include: { template: true } } } },
} satisfies Prisma.BookingInclude;

type RequestRow = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;
type ContractRow = RequestRow['contracts'][number];

const PENDING_CONTRACT: BookingContractStatus[] = [BookingContractStatus.AWAITING_CUSTOMER, BookingContractStatus.AWAITING_VENDOR, BookingContractStatus.AWAITING_CLIENT];

const vendorName = (b: Pick<RequestRow, 'vendor'>) => b.vendor.vendorProfile?.business_name || b.vendor.name || 'The vendor';
const titleOf = (b: Pick<RequestRow, 'listing'>) => b.listing?.title ?? 'your booking';

/**
 * Suggested changes to a booking request (see request-changes.ts for the rules): the vendor previews and
 * sends new terms with the updated contract, signed; the customer approves (signs) or declines; the vendor
 * can withdraw. Approving changes the booking's terms; the vendor then accepts as usual.
 */
@Injectable()
export class RequestChangesService {
  private readonly logger = new Logger(RequestChangesService.name);

  constructor(
    private prisma: PrismaService,
    private contracts: BookingContractsService,
    private addOns: AddOnsService,
    private packageOptions: PackageOptionsService,
    private chat: ChatExtrasService,
  ) {}

  // ─── Loading ──────────────────────────────────────────────────────────────

  private async load(bookingId: string, user: AuthUser) {
    const b = await this.prisma.booking.findFirst({ where: { id: bookingId, deleted_at: null }, include: bookingInclude });
    if (!b) throw new NotFoundException('Booking not found');
    const role = b.vendor_id === user.userId ? 'VENDOR' : b.customer_id === user.userId ? 'CUSTOMER' : null;
    if (!role) throw new ForbiddenException('Access denied');
    return { b, role } as const;
  }

  /** The suggestion waiting for the customer, if any. */
  private waiting(b: RequestRow) {
    return b.contracts.find((c) => c.status === BookingContractStatus.AWAITING_CUSTOMER && readProposal(c.merge_data)) ?? null;
  }

  /** The contract the vendor would accept: the request's, or an approved suggestion. */
  private base(b: RequestRow) {
    return b.contracts.find((c) => c.status === BookingContractStatus.AWAITING_VENDOR) ?? null;
  }

  /** Why the vendor can't suggest changes on this request right now, or null. */
  private cannotSuggest(b: RequestRow, now = new Date()) {
    if (b.status !== BookingStatus.PENDING) return 'Changes can only be suggested while the request is waiting for you.';
    if (!b.listing_id || !b.listing) return 'Changes can’t be suggested on a rental request. Message the customer instead.';
    if (this.waiting(b)) return 'Your suggested changes are already waiting for the customer.';
    if (b.contracts.some((c) => c.status === BookingContractStatus.AWAITING_CLIENT)) return 'The planner’s client hasn’t co-signed the request yet. You can suggest changes once they have.';
    if (!this.base(b)) return 'This request has no contract to change.';
    if (requestExpiresAt(b) <= now) return 'This request closed because it wasn’t answered in time.';
    return null;
  }

  // ─── Terms ────────────────────────────────────────────────────────────────

  /** The plan the customer will be charged on when the vendor accepts (as PaymentsService.scheduleForBooking picks it). */
  private planOf(b: RequestRow): PaymentPlan {
    return b.payment_plan ?? b.listing?.payment_plan ?? b.listing?.category?.default_payment_plan ?? PaymentPlan.FULL_ON_ACCEPT;
  }

  private schedule(plan: PaymentPlan, price: number, fee: number, start: Date | string | null) {
    return buildSchedule({ plan, price, serviceFee: fee, eventStart: start ? new Date(start) : null }).map((i) => ({
      label: i.label,
      amount: i.amount,
      // the first charge is taken when the vendor accepts: no date to show for it yet
      due_at: i.sequence === 1 && !i.capture_manually ? null : i.due_at.toISOString(),
      capture_manually: i.capture_manually,
    }));
  }

  private evOf(t: { guest_count?: number | null; event_start_at?: Date | string | null; scheduled_at?: Date | string | null; event_end_at?: Date | string | null }): EventInput {
    return { guest_count: t.guest_count ?? null, event_start_at: t.event_start_at ?? t.scheduled_at ?? null, event_end_at: t.event_end_at ?? null };
  }

  /**
   * The request's terms as they are now, from the booking row (the source of truth for money). The package
   * line comes from `source`, the contract the vendor would accept: what was requested (or last agreed).
   */
  private currentTerms(b: RequestRow, plan: PaymentPlan, source: ContractRow | null): RequestTerms {
    const lines = b.extras.map((e) => {
      const unit_price = Number(e.unit_price);
      const quantity = Number(e.quantity);
      return {
        extra_id: e.id,
        add_on_id: e.add_on_id,
        kind: e.kind,
        name: e.name,
        description: e.description,
        price_unit: e.price_unit as AddOnUnit,
        unit_price,
        quantity,
        amount: Number(e.amount),
        label: lineLabel(e.name, e.price_unit as AddOnUnit, unit_price, quantity),
        usual_price: unit_price,
      };
    });
    const options = readChosenOptions(b.chosen_options);
    const optionsAmount = round2(options.reduce((s, g) => s + Number(g.amount ?? 0), 0));
    const discount = round2(Number(b.discount ?? 0));
    const price = round2(Number(b.amount ?? 0));
    const ev = this.evOf(b);
    const md = (source?.merge_data ?? null) as { package_terms?: unknown; pricing_schedule?: unknown } | null;
    const pkg = packageAsRequested(
      readProposal(md)?.after.package ?? md?.package_terms,
      md?.pricing_schedule,
      round2(price + discount - lines.reduce((s, l) => s + l.amount, 0) - optionsAmount),
      options,
    );
    const fee = round2(Number(b.service_fee ?? 0));
    return {
      scheduled_at: b.scheduled_at?.toISOString() ?? null,
      event_start_at: b.event_start_at?.toISOString() ?? null,
      event_end_at: b.event_end_at?.toISOString() ?? null,
      guest_count: b.guest_count,
      package: pkg,
      lines,
      options,
      options_amount: optionsAmount,
      promo_code: b.promo_code,
      discount,
      price,
      service_fee: fee,
      total: round2(price + fee),
      plan,
      schedule: this.schedule(plan, price, fee, ev.event_start_at ?? null),
    };
  }

  /** The vendor's add-ons and fees that can go on this request: the package's own, and their library. */
  private async catalog(vendorId: string, listingId: string): Promise<CatalogItem[]> {
    const rows = await this.prisma.vendorAddOn.findMany({
      where: { vendor_id: vendorId, deleted_at: null, OR: [{ in_library: true }, { listings: { some: { listing_id: listingId } } }] },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    return rows.map((a) => ({ id: a.id, kind: a.kind, name: a.name, description: a.description, price: Number(a.price), price_unit: a.price_unit as AddOnUnit }));
  }

  /**
   * The suggested terms, priced on the server from what the vendor sent (nothing the apps total is used).
   * Throws a 400 with a message the vendor can act on.
   */
  private async proposedTerms(b: RequestRow, before: RequestTerms, dto: ProposalDto, plan: PaymentPlan) {
    const listing = b.listing!;
    const now = new Date();
    // a new start moves the end with it (a multi-day event keeps its length) unless a new end is sent
    const { start, end } = suggestedTimes({ start: b.event_start_at ?? b.scheduled_at, end: b.event_end_at }, { start: dto.event_start_at, end: dto.event_end_at });
    if (dto.event_start_at && dto.event_start_at <= now) throw new BadRequestException('Pick a date and time in the future.');
    if (start && end && end <= start) throw new BadRequestException('The end time must be after the start time.');
    const guests = dto.guest_count ?? b.guest_count;
    // a venue takes its booking on how many guests are coming
    if (needsGuestCount(listing) && !(Number(guests ?? 0) >= 1)) throw new BadRequestException({ message: 'Enter how many guests are coming. A venue is booked for a number of guests.', error: 'GUEST_COUNT_REQUIRED' });
    const ev: EventInput = { guest_count: guests, event_start_at: start, event_end_at: end };

    try {
      const pkg = packageForProposal(before.package, ev);
      const lines = priceProposalLines(
        dto.lines ?? before.lines.map((l) => ({ extra_id: l.extra_id, quantity: l.quantity, unit_price: l.unit_price })),
        b.extras.map((e): ExistingLine => ({ id: e.id, add_on_id: e.add_on_id, kind: e.kind, name: e.name, description: e.description, price_unit: e.price_unit as AddOnUnit, unit_price: Number(e.unit_price), quantity: Number(e.quantity), amount: Number(e.amount) })),
        await this.catalog(b.vendor_id, listing.id),
        ev,
      );
      // customizations: the customer's pickers and rules (required, pick up to N); prices as chosen
      // (a quote's price is flat: its per unit upcharges count the guests, hours or days given, as at the request)
      const basis: UnitBasis =
        pkg.unit === 'fixed' && pkg.basis_unit && pkg.basis_unit !== 'fixed' ? quoteBasis(pkg.basis_unit, ev) : { unit: pkg.unit, quantity: pkg.quantity };
      const choices = dto.options ?? before.options.map((g) => ({ group_id: g.group_id, option_ids: g.options.map((o) => o.option_id) }));
      const options = priceOptionChoices(withChosenPrices(await this.packageOptions.offered(listing.id), before.options), choices, basis);

      const subtotal = round2(pkg.amount + lines.reduce((s, l) => s + l.amount, 0) + options.amount);
      const promo = await this.promoFor(b.promo_code, subtotal);
      const price = round2(subtotal - promo.discount);
      if (price > MAX_PROPOSAL_PRICE) throw new RequestChangeError(`The total can be up to $${MAX_PROPOSAL_PRICE.toLocaleString('en-US')}.`);
      const fee = platformServiceFee(price, listing.category_id);
      const after: RequestTerms = {
        scheduled_at: start ? new Date(start).toISOString() : null,
        event_start_at: b.event_start_at || dto.event_start_at ? new Date(start!).toISOString() : null,
        event_end_at: end ? new Date(end).toISOString() : null,
        guest_count: guests ?? null,
        package: pkg,
        lines,
        options: options.groups,
        options_amount: options.amount,
        promo_code: promo.code,
        discount: promo.discount,
        price,
        service_fee: fee,
        total: round2(price + fee),
        plan,
        schedule: this.schedule(plan, price, fee, start ?? null),
      };
      return { after, promoNote: promo.note };
    } catch (e) {
      if (e instanceof RequestChangeError || e instanceof PricingError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  /**
   * A promo code on the request stays applied (worked out again on the new price): it was already used
   * on this request. It drops off only if the new price is under its minimum, or Vendly removed the code.
   */
  private async promoFor(code: string | null, subtotal: number) {
    if (!code) return { code: null, discount: 0, note: null as string | null };
    const promo = await this.prisma.promoCode.findUnique({ where: { code } });
    if (!promo) return { code: null, discount: 0, note: `The promo code ${code} no longer exists, so it no longer applies.` };
    if (promo.min_amount != null && subtotal < Number(promo.min_amount)) {
      return { code: null, discount: 0, note: `The promo code ${code} needs a booking of at least $${Number(promo.min_amount).toFixed(2)}, so it no longer applies.` };
    }
    return { code: promo.code, discount: promoDiscount(promo, subtotal), note: null };
  }

  /** The updated contract for the suggested terms: the request's contract filled in again, with a note of what changed. */
  private async proposalContract(b: RequestRow, base: ContractRow, after: RequestTerms, changes: string[]) {
    const vc = base.vendor_contract as ResolvedVendorContract;
    const prev = (base.merge_data ?? {}) as MergeData;
    const version = b.contracts[0].version + 1;
    const data = buildMergeData({
      booking: {
        id: b.id,
        scheduled_at: after.scheduled_at,
        event_start_at: after.event_start_at,
        event_end_at: after.event_end_at,
        // where it happens doesn't change (a venue keeps "At the Vendor's place in …")
        venue_address: prev.venue_address || b.venue_address,
        guest_count: after.guest_count,
        message: b.message,
        amount: after.price,
        service_fee: after.service_fee,
        currency: b.currency,
      },
      listing: b.listing,
      vendor: b.vendor,
      customer: b.customer,
      event: b.event_bookings[0]?.event ?? null,
      fieldValues: vc.field_values as Record<string, unknown>,
      additionalTerms: vc.additional_terms,
      contractVersion: version,
      timezone: prev.timezone,
    });
    const { fees } = await this.addOns.forListing(b.listing!.id);
    const charged = new Set(after.lines.map((l) => l.add_on_id).filter(Boolean));
    data.pricing_schedule = buildPricingSchedule({
      packageLabel: after.package.label.startsWith('Quote:') || after.package.unit !== 'fixed' ? after.package.label : null,
      packageAmount: after.package.amount,
      addOns: after.lines.filter((l) => l.kind === AddOnKind.ADD_ON).map((l) => ({ label: l.label, amount: l.amount, description: l.description })),
      includedFees: after.lines.filter((l) => l.kind === AddOnKind.FEE).map((l) => ({ label: l.label, amount: l.amount, description: l.description })),
      options: optionScheduleLines(after.options),
      discount: after.discount,
      promoCode: after.promo_code,
      vendorPrice: after.price,
      // the fees the vendor may still ask for after the job (not ones now charged with the booking)
      fees: fees.filter((f) => !charged.has(f.id)).map((f) => ({ name: f.name, price_text: f.price_text, description: f.description })),
      customerRoleLabel: data.customer_role_label,
    });
    const rendered = this.contracts.renderFor(vc, data);
    const role = data.customer_role_label;
    const body = `${rendered.body}\n\n## Changes suggested by the Vendor\nThis version replaces the booking request signed as version ${base.version} (verification ${base.verification_code}). The Vendor suggested these changes: ${changes.join('; ')}. It takes effect once the ${role} signs it and the Vendor accepts the booking. If the ${role} declines, the request stays as it was. Nothing is charged before the Vendor accepts.`;
    return { vc, version, data, title: rendered.title, body, content: contentHash(body, vc.file_sha256), missing: missingFields(rendered.required, data) };
  }

  private async prepare(bookingId: string, user: AuthUser, dto: ProposalDto) {
    const { b, role } = await this.load(bookingId, user);
    if (role !== 'VENDOR') throw new ForbiddenException('Only the vendor can suggest changes to a request.');
    const blocked = this.cannotSuggest(b);
    if (blocked) throw new BadRequestException(blocked);
    const base = this.base(b)!;
    const plan = this.planOf(b);
    const before = this.currentTerms(b, plan, base);
    const { after, promoNote } = await this.proposedTerms(b, before, dto, plan);
    if (sameTerms(before, after)) throw new BadRequestException('Nothing has changed yet. Edit the date, guests, add-ons, fees or customizations first.');
    const changes = describeChanges(before, after);
    const contract = await this.proposalContract(b, base, after, changes);
    const note = dto.note?.trim() || null;
    const proposal: ProposalData = { note, base_contract_id: base.id, before, after, changes, promo_note: promoNote };
    return { b, base, before, after, changes, contract, proposal };
  }

  // ─── Vendor ───────────────────────────────────────────────────────────────

  /** What the new terms come to, and the updated contract to sign. Nothing is saved. */
  async preview(bookingId: string, user: AuthUser, dto: ProposalDto) {
    const p = await this.prepare(bookingId, user, dto);
    return {
      success: true,
      data: {
        ...this.comparison(p.proposal),
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

  /** Sends the suggestion: a new contract version signed by the vendor, waiting for the customer. */
  async send(bookingId: string, user: AuthUser, dto: SendProposalDto, meta: RequestMeta) {
    const p = await this.prepare(bookingId, user, dto);
    if (p.contract.missing.length) throw new BadRequestException(missingFieldsMessage(p.contract.missing));
    if (p.contract.content !== dto.signature.content_sha256) {
      throw new ConflictException({ message: 'The changes or the contract changed since you reviewed them. Please review and sign again.', error: 'CONTRACT_CHANGED' });
    }
    const imageKey = await this.contracts.resolveVendorSignatureImage(user.userId, dto.signature);
    // Signatures are write-once and the vendor signs this version again with Accept & Sign once the
    // customer approves, so the signature sent with the changes is kept with them and in the audit trail.
    const sentWith = { legal_name: dto.signature.legal_name.trim(), signed_at: new Date().toISOString(), signature_image_key: imageKey, document_sha256: p.contract.content };
    const created = await this.prisma.$transaction(async (tx) => {
      // only while the request is still open and nothing else is waiting. Touching the row locks it, so an
      // Accept & Sign, decline, cancellation or expiry running now waits for this (and then sees the suggestion)
      const open = await tx.booking.updateMany({ where: { id: bookingId, status: BookingStatus.PENDING }, data: { updated_at: new Date() } });
      if (!open.count) throw new BadRequestException('This request is no longer open.');
      const busy = await tx.bookingContract.count({ where: { booking_id: bookingId, status: BookingContractStatus.AWAITING_CUSTOMER } });
      if (busy) throw new ConflictException('Your suggested changes are already waiting for the customer.');
      const c = await tx.bookingContract.create({
        data: {
          booking_id: bookingId,
          vendor_contract_id: p.contract.vc.id,
          version: p.contract.version,
          status: BookingContractStatus.AWAITING_CUSTOMER,
          title: p.contract.title,
          rendered_body: p.contract.body,
          merge_data: { ...p.contract.data, request_changes: { ...p.proposal, vendor_signature: sentWith } } as unknown as Prisma.InputJsonValue,
          source_pdf_key: p.base.source_pdf_key,
          source_pdf_sha256: p.base.source_pdf_sha256,
          content_sha256: p.contract.content,
          verification_code: verificationCode(),
          supersedes_id: p.base.id,
          // a planner's client who co-signed the request co-signs the changes too, once the planner approves
          client_email: p.base.client_email,
        },
      });
      await this.contracts.audit(tx, { booking_contract_id: c.id, actor_id: user.userId, actor_role: ContractSignerRole.VENDOR, action: ContractAuditAction.CREATED, meta, details: { suggests_changes_to: p.base.id, changes: p.changes } });
      await this.contracts.audit(tx, {
        booking_contract_id: c.id,
        actor_id: user.userId,
        actor_role: ContractSignerRole.VENDOR,
        action: ContractAuditAction.SIGNED,
        meta,
        details: { suggested_changes: true, ...sentWith, consent_text_version: CONSENT_TEXT_VERSION, device_platform: dto.signature.device_platform ?? null, app_version: dto.signature.app_version ?? null },
      });
      return c;
    });

    const vendor = vendorName(p.b);
    const title = titleOf(p.b);
    void this.contracts.notify(p.b.customer_id, p.b.customer.email, p.b.customer.name, {
      subject: `${vendor} suggested changes: ${title}`,
      message: `${vendor} suggested changes to your request for ${title} (${p.changes.join('; ')}). Review them on the booking, then approve and sign, or decline to keep your original request.${p.proposal.note ? ` Their note: “${p.proposal.note}”` : ''}`,
      bookingId,
      listingTitle: title,
      ctaPath: `/bookings/${bookingId}`,
      pushData: { type: 'booking', bookingId },
    });
    await this.notice(p.b.vendor_id, p.b.customer_id, `${vendor} suggested changes to the request for ${title}. Open the booking to review them and approve or decline.`);
    return { success: true, data: { contract_id: created.id, version: created.version, ...this.comparison(p.proposal) } };
  }

  /** The vendor takes back a suggestion the customer hasn't answered. The original request stands. */
  async withdraw(bookingId: string, user: AuthUser, meta: RequestMeta) {
    const { b, role } = await this.load(bookingId, user);
    if (role !== 'VENDOR') throw new ForbiddenException('Only the vendor can withdraw their suggested changes.');
    const c = this.waiting(b);
    if (!c) throw new BadRequestException('There are no suggested changes waiting on this request.');
    await this.close(b, c, 'Withdrawn by the vendor', user.userId, 'VENDOR', meta);
    const title = titleOf(b);
    void this.contracts.notify(b.customer_id, b.customer.email, b.customer.name, {
      subject: `Suggested changes withdrawn: ${title}`,
      message: `${vendorName(b)} withdrew the changes they suggested. Your original request for ${title} stands, and they can still accept it.`,
      bookingId,
      listingTitle: title,
      ctaPath: `/bookings/${bookingId}`,
      pushData: { type: 'booking', bookingId },
    });
    await this.notice(b.vendor_id, b.customer_id, `${vendorName(b)} withdrew the suggested changes. The original request for ${title} stands.`);
    return { success: true };
  }

  // ─── Customer ─────────────────────────────────────────────────────────────

  /**
   * The customer approves and signs the suggestion. The booking's terms change to it (price, Vendly fee,
   * add-ons and fees, customizations, date, guests); the request goes back to the vendor to Accept & Sign.
   */
  async approve(bookingId: string, user: AuthUser, sig: SignatureDto, meta: RequestMeta) {
    const { b, role } = await this.load(bookingId, user);
    if (role !== 'CUSTOMER') throw new ForbiddenException('Only the customer can approve suggested changes.');
    if (b.status !== BookingStatus.PENDING) throw new BadRequestException('This request is no longer open.');
    const c = this.waiting(b);
    const proposal = c && readProposal(c.merge_data);
    if (!c || !proposal) throw new BadRequestException('There are no suggested changes waiting on this request.');
    if (sig.content_sha256 !== c.content_sha256) throw new ConflictException('The contract you reviewed does not match. Please reload and sign again.');
    const start = proposal.after.event_start_at ?? proposal.after.scheduled_at;
    if (start && new Date(start) <= new Date()) throw new BadRequestException('The suggested date has already passed. Decline the changes and message the vendor.');
    const signerRole = await this.contracts.customerSignerRole(bookingId, b.customer.type);
    const imageKey = await this.contracts.storeSignatureImage(sig.signature_image, `signatures/${user.userId}`);
    const after = proposal.after;
    const now = new Date();
    // the planner's client co-signed the request: they co-sign the approved changes before the vendor accepts
    const clientNext = !!c.client_email;

    await this.prisma.$transaction(async (tx) => {
      // the status guards stop a double approval, or an approval racing a withdrawal or an answer
      const moved = await tx.bookingContract.updateMany({
        where: { id: c.id, status: BookingContractStatus.AWAITING_CUSTOMER },
        // the vendor's 24-hour reminder counts from now (updated_at), not from when the changes were sent
        data: { status: clientNext ? BookingContractStatus.AWAITING_CLIENT : BookingContractStatus.AWAITING_VENDOR, last_reminder_at: null },
      });
      if (moved.count !== 1) throw new ConflictException('These changes were already answered or withdrawn.');
      const replaced = await tx.bookingContract.updateMany({ where: { id: c.supersedes_id!, status: BookingContractStatus.AWAITING_VENDOR }, data: { status: BookingContractStatus.SUPERSEDED } });
      if (replaced.count !== 1) throw new ConflictException('This request changed in the meantime. Please reload.');
      await tx.contractSignature.create({ data: this.contracts.signatureRow(c.id, user.userId, signerRole, sig, c.content_sha256, imageKey, b.customer.email, meta) });
      await this.contracts.audit(tx, { booking_contract_id: c.id, actor_id: user.userId, actor_role: signerRole, action: ContractAuditAction.SIGNED, meta, details: { approved_changes: proposal.changes } });
      await this.contracts.audit(tx, { booking_contract_id: c.supersedes_id, actor_id: user.userId, action: ContractAuditAction.SUPERSEDED, meta, details: { by: c.id } });

      // the booking row is what charges, refunds, cancellations and payouts read: it takes the new terms
      const updated = await tx.booking.updateMany({
        where: { id: bookingId, status: BookingStatus.PENDING },
        data: {
          amount: after.price,
          service_fee: after.service_fee,
          scheduled_at: after.scheduled_at ? new Date(after.scheduled_at) : null,
          event_start_at: after.event_start_at ? new Date(after.event_start_at) : null,
          event_end_at: after.event_end_at ? new Date(after.event_end_at) : null,
          guest_count: after.guest_count,
          chosen_options: after.options.length ? (after.options as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          options_amount: after.options.length ? after.options_amount : null,
          promo_code: after.promo_code,
          discount: after.discount || null,
          // the vendor has at least 48 hours from now to accept (request-changes.ts)
          request_opened_at: reopenedAt(b.request_opened_at ?? b.created_at, now),
          expiry_reminded_at: null,
        },
      });
      if (updated.count !== 1) throw new BadRequestException('This request is no longer open.');
      await this.applyLines(tx, bookingId, after.lines);
      // a promo that no longer applies gives its use back
      if (b.promo_code && !after.promo_code) await tx.promoCode.updateMany({ where: { code: b.promo_code, uses: { gt: 0 } }, data: { uses: { decrement: 1 } } });
    });

    const title = titleOf(b);
    if (clientNext) await this.contracts.notifyClientToSign(bookingId).catch((err) => this.logger.warn(`Client co-sign notice failed: ${(err as Error).message}`));
    void this.contracts.notify(b.vendor_id, b.vendor.email, b.vendor.name, {
      subject: `Customer approved your changes: ${title}`,
      message: clientNext
        ? `${b.customer.name ?? 'The planner'} approved and signed the changes you suggested for ${title}. Their client co-signs them next; you can Accept & Sign once they have.`
        : `${b.customer.name ?? 'The customer'} approved and signed the changes you suggested for ${title}. Review the request and tap Accept & Sign to confirm it.`,
      bookingId,
      contractId: c.id,
      listingTitle: title,
      ctaPath: `/vendor/bookings/${bookingId}`,
      pushData: { type: 'booking', bookingId },
    });
    await this.notice(b.customer_id, b.vendor_id, `${b.customer.name ?? 'The customer'} approved the suggested changes for ${title}. It is back with ${vendorName(b)} to accept.`);
    // a new date may be busy elsewhere; the vendor sees that on the request as usual
    return { success: true, message: clientNext ? 'Changes approved. Your client co-signs them next, then the vendor can accept.' : 'Changes approved. The vendor can now accept your request.' };
  }

  /** The customer turns the suggestion down: the original request stands, and the vendor can still answer it. */
  async decline(bookingId: string, user: AuthUser, reason: string | undefined, meta: RequestMeta) {
    const { b, role } = await this.load(bookingId, user);
    if (role !== 'CUSTOMER') throw new ForbiddenException('Only the customer can decline suggested changes.');
    const c = this.waiting(b);
    if (!c) throw new BadRequestException('There are no suggested changes waiting on this request.');
    const why = reason?.trim() || null;
    await this.close(b, c, 'Declined by the customer', user.userId, 'CUSTOMER', meta, why);
    const title = titleOf(b);
    void this.contracts.notify(b.vendor_id, b.vendor.email, b.vendor.name, {
      subject: `Changes declined: ${title}`,
      message: `${b.customer.name ?? 'The customer'} declined the changes you suggested${why ? ` (“${why}”)` : ''}. Their original request for ${title} stands: you can accept it, suggest other changes, or decline it.`,
      bookingId,
      listingTitle: title,
      ctaPath: `/vendor/bookings/${bookingId}`,
      pushData: { type: 'booking', bookingId },
    });
    await this.notice(b.customer_id, b.vendor_id, `${b.customer.name ?? 'The customer'} declined the suggested changes. The original request for ${title} stands.`);
    return { success: true, message: 'Changes declined. Your original request stands.' };
  }

  /** Voids a waiting suggestion; the request's contract becomes the one to accept again. */
  private async close(b: RequestRow, c: ContractRow, reason: string, actorId: string, actorRole: string, meta: RequestMeta, note?: string | null) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const voided = await tx.bookingContract.updateMany({ where: { id: c.id, status: BookingContractStatus.AWAITING_CUSTOMER }, data: { status: BookingContractStatus.VOID, voided_at: now, void_reason: reason } });
      if (voided.count !== 1) throw new ConflictException('These changes were already answered or withdrawn.');
      await this.contracts.audit(tx, { booking_contract_id: c.id, actor_id: actorId, actor_role: actorRole, action: ContractAuditAction.VOIDED, meta, details: { reason, ...(note ? { note } : {}) } });
      // the request's contract is the vendor's to sign again: their 24-hour reminder counts from now (updated_at)
      if (c.supersedes_id) await tx.bookingContract.updateMany({ where: { id: c.supersedes_id, status: BookingContractStatus.AWAITING_VENDOR }, data: { last_reminder_at: null } });
      // the vendor has at least 48 hours from now to answer the original request
      await tx.booking.updateMany({ where: { id: b.id, status: BookingStatus.PENDING }, data: { request_opened_at: reopenedAt(b.request_opened_at ?? b.created_at, now), expiry_reminded_at: null } });
    });
  }

  /** The request's add-on and fee lines become the agreed ones (nothing on them has been charged yet). */
  private async applyLines(tx: Prisma.TransactionClient, bookingId: string, lines: RequestTerms['lines']) {
    const kept = lines.filter((l) => l.extra_id).map((l) => l.extra_id!);
    await tx.bookingExtra.deleteMany({ where: { booking_id: bookingId, status: BookingExtraStatus.INCLUDED, id: { notIn: kept } } });
    for (const l of lines) {
      const data = { unit_price: l.unit_price, quantity: l.quantity, amount: l.amount };
      if (l.extra_id) {
        await tx.bookingExtra.updateMany({ where: { id: l.extra_id, booking_id: bookingId, status: BookingExtraStatus.INCLUDED }, data });
      } else {
        await tx.bookingExtra.create({
          data: { booking_id: bookingId, add_on_id: l.add_on_id, kind: l.kind, name: l.name, description: l.description, price_unit: l.price_unit, ...data, status: BookingExtraStatus.INCLUDED },
        });
      }
    }
  }

  // ─── Reading ──────────────────────────────────────────────────────────────

  /** The before and after for the apps' comparison: every line paired up, and what changed. */
  private comparison(p: ProposalData) {
    return { before: p.before, after: p.after, changes: p.changes, note: p.note, promo_note: p.promo_note, lines: pairLines(p.before, p.after) };
  }

  /**
   * The request's suggested-changes state for the booking screen: the suggestion waiting (or approved),
   * the last one declined or withdrawn, and for the vendor what the editor starts from.
   */
  async state(bookingId: string, user: AuthUser) {
    const { b, role } = await this.load(bookingId, user);
    const latest = b.contracts.find((c) => readProposal(c.merge_data)) ?? null;
    const proposal = latest && readProposal(latest.merge_data)!;
    const status = !latest
      ? null
      : latest.status === BookingContractStatus.AWAITING_CUSTOMER
        ? 'WAITING'
        : PENDING_CONTRACT.includes(latest.status) || latest.status === BookingContractStatus.EXECUTED
          ? 'APPROVED'
          : latest.status === BookingContractStatus.VOID && latest.void_reason === 'Declined by the customer'
            ? 'DECLINED'
            : latest.status === BookingContractStatus.VOID && latest.void_reason === 'Withdrawn by the vendor'
              ? 'WITHDRAWN'
              : null;
    const blocked = role === 'VENDOR' ? this.cannotSuggest(b) : null;
    let editor: Record<string, unknown> | null = null;
    if (role === 'VENDOR' && b.status === BookingStatus.PENDING && b.listing) {
      const plan = this.planOf(b);
      const current = this.currentTerms(b, plan, this.base(b) ?? b.contracts.find((c) => c.version === 1) ?? null);
      const [catalog, groups] = await Promise.all([
        this.catalog(b.vendor_id, b.listing.id),
        this.prisma.listingOptionGroup.findMany({ where: { listing_id: b.listing.id }, ...OPTION_GROUPS_INCLUDE }),
      ]);
      editor = {
        current,
        add_ons: catalog.filter((a) => a.kind === AddOnKind.ADD_ON),
        fees: catalog.filter((a) => a.kind === AddOnKind.FEE),
        customizations: formatOptionGroups(groups, b.listing.price_unit),
        price_unit: packageUnit(b.listing.price_unit),
        needs_guest_count: needsGuestCount(b.listing),
        from_quote: current.package.label.startsWith('Quote:'),
      };
    }
    return {
      success: true,
      data: {
        role,
        can_suggest: role === 'VENDOR' && !blocked,
        cannot_suggest_reason: blocked,
        proposal:
          latest && proposal && status
            ? {
                contract_id: latest.id,
                version: latest.version,
                status,
                sent_at: latest.created_at,
                vendor_name: vendorName(b),
                // who signed the changes for the vendor when sending them
                signed_by: proposal.vendor_signature?.legal_name ?? null,
                // approved, and now with the planner's client to co-sign before the vendor can accept
                client_cosigning: latest.status === BookingContractStatus.AWAITING_CLIENT,
                content_sha256: latest.content_sha256,
                ...this.comparison(proposal),
              }
            : null,
        editor,
        consent_text: CONSENT_TEXT,
      },
    };
  }

  /** A notice in the 1:1 chat; a failure never stops the booking change. */
  private async notice(senderId: string, otherId: string, text: string) {
    await this.chat.bookingNotice(senderId, otherId, text).catch((err) => this.logger.warn(`Chat notice failed: ${(err as Error).message}`));
  }
}
