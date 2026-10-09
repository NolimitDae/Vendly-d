import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import * as JSZip from 'jszip';
import {
  BookingContractStatus,
  BookingStatus,
  ContractAuditAction,
  ContractSignerRole,
  ListingStatus,
  Prisma,
  UserType,
  VendorContractStatus,
} from 'prisma/generated/client';
import appConfig from 'src/config/app.config';
import { MailService } from 'src/mail/mail.service';
import { PushService } from 'src/modules/push/push.service';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  MergeData,
  buildMergeData,
  contentHash,
  fieldLabel,
  missingFields,
  missingFieldsMessage,
  renderTemplate,
  serviceFeeFor,
  sha256,
} from './contract-merge';
import {
  CertificateSigner,
  PdfValidationError,
  buildDraftPdf,
  buildExecutedPdf,
  decodeSignatureImage,
} from './contract-pdf';
import { CONSENT_TEXT, CONSENT_TEXT_VERSION } from './contract-templates';
import { PrivateStorage, SignedUrl } from './private-storage';
import { ResolvedVendorContract, VendorContractsService } from './vendor-contracts.service';
import {
  AmendmentChangesDto,
  AmendmentPreviewDto,
  AmendmentRequestDto,
  BookingContractFieldsDto,
  SignatureDto,
  SignedBookingRequestDto,
} from './dto/contracts.dto';

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuthUser {
  userId: string;
  type?: string;
}

type Tx = Prisma.TransactionClient;

const PENDING_STATUSES: BookingContractStatus[] = [
  BookingContractStatus.DRAFT,
  BookingContractStatus.AWAITING_CUSTOMER,
  BookingContractStatus.AWAITING_VENDOR,
];

const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;
const HOUR = 3600 * 1000;

const vendorSelect = {
  id: true,
  name: true,
  email: true,
  phone_number: true,
  vendorProfile: { select: { business_name: true, address: true, saved_signature_key: true } },
} as const;

function tokenSecret() {
  const s = process.env.JWT_SECRET || process.env.APP_KEY;
  if (!s) throw new Error('JWT_SECRET is required');
  return s;
}

function signPreview(claims: { bid: string; lid: string; uid: string }) {
  const payload = Buffer.from(JSON.stringify({ ...claims, exp: Date.now() + PREVIEW_TTL_MS, p: 'contract-preview' })).toString('base64url');
  return `${payload}.${createHmac('sha256', tokenSecret()).update(payload).digest('base64url')}`;
}

function verifyPreview(token: string): { bid: string; lid: string; uid: string } | null {
  const [payload, sig] = (token ?? '').split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', tokenSecret()).update(payload).digest('base64url');
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return c.p === 'contract-preview' && c.exp > Date.now() ? c : null;
  } catch {
    return null;
  }
}

function verificationCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

@Injectable()
export class BookingContractsService {
  private readonly logger = new Logger(BookingContractsService.name);

  constructor(
    private prisma: PrismaService,
    private vendorContracts: VendorContractsService,
    private mail: MailService,
    private push: PushService,
  ) {}

  // ─── Audit ──────────────────────────────────────────────────────────────

  audit(
    db: Tx | PrismaService,
    e: {
      booking_contract_id?: string | null;
      vendor_contract_id?: string | null;
      actor_id?: string | null;
      actor_role?: string | null;
      action: ContractAuditAction;
      meta?: RequestMeta;
      details?: Prisma.InputJsonValue;
    },
  ) {
    return db.contractAuditEvent.create({
      data: {
        booking_contract_id: e.booking_contract_id ?? null,
        vendor_contract_id: e.vendor_contract_id ?? null,
        actor_id: e.actor_id ?? null,
        actor_role: e.actor_role ?? null,
        action: e.action,
        ip_address: e.meta?.ip ?? null,
        user_agent: e.meta?.userAgent?.slice(0, 1000) ?? null,
        details: e.details,
      },
    });
  }

  // ─── Building contracts ─────────────────────────────────────────────────

  private serviceFee(price: unknown) {
    return serviceFeeFor(price, appConfig().fees.customer_service_fee_percent);
  }

  private async loadBookingContext(userId: string, dto: BookingContractFieldsDto) {
    const listing = await this.prisma.vendorListing.findFirst({
      where: { id: dto.listing_id, status: ListingStatus.ACTIVE, deleted_at: null },
      include: { vendor: { select: vendorSelect } },
    });
    if (!listing) throw new NotFoundException('Listing not found or not active');
    if (listing.vendor_id !== dto.vendor_id) throw new BadRequestException('Vendor ID does not match listing');
    if (listing.vendor_id === userId) throw new BadRequestException('You cannot book your own listing');

    const customer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, type: true },
    });
    if (!customer) throw new NotFoundException('User not found');

    let event: { id: string; name: string; venue: string | null; guest_count: number | null } | null = null;
    if (dto.event_id) {
      event = await this.prisma.event.findFirst({
        where: { id: dto.event_id, event_planner_id: userId },
        select: { id: true, name: true, venue: true, guest_count: true },
      });
      if (!event) throw new ForbiddenException('Event not found');
    }

    let vc = await this.vendorContracts.resolveForListing(listing.vendor_id, listing.id);
    if (!vc) {
      // vendors without a contract get the Vendly default; they review it when they Accept & Sign
      await this.vendorContracts.createDefaultFromProfile(listing.vendor_id);
      vc = await this.vendorContracts.resolveForListing(listing.vendor_id, listing.id);
    }
    if (!vc) throw new BadRequestException('This vendor has no contract available.');
    return { listing, customer, event, vc };
  }

  private renderFor(
    vc: ResolvedVendorContract,
    data: MergeData,
  ) {
    const source = this.vendorContracts.contractSource(vc);
    const body = renderTemplate(source.body, data);
    return {
      title: source.title,
      body,
      required: source.required,
      content_sha256: contentHash(body, vc.file_sha256),
    };
  }

  private async prepareForBooking(userId: string, dto: BookingContractFieldsDto, bookingId: string) {
    const ctx = await this.loadBookingContext(userId, dto);
    const data = buildMergeData({
      booking: {
        id: bookingId,
        scheduled_at: dto.scheduled_at ?? dto.event_start_at,
        event_start_at: dto.event_start_at,
        event_end_at: dto.event_end_at,
        venue_address: dto.venue_address,
        guest_count: dto.guest_count,
        message: dto.message,
        amount: ctx.listing.price,
        service_fee: this.serviceFee(ctx.listing.price),
        currency: 'usd',
      },
      listing: ctx.listing,
      vendor: ctx.listing.vendor,
      customer: ctx.customer,
      event: ctx.event,
      fieldValues: ctx.vc.field_values as Record<string, unknown>,
      additionalTerms: ctx.vc.additional_terms,
      contractVersion: 1,
      timezone: dto.timezone,
    });
    const rendered = this.renderFor(ctx.vc, data);
    return { ...ctx, data, rendered, missing: missingFields(rendered.required, data) };
  }

  private consentInfo() {
    return { consent_text: CONSENT_TEXT, consent_text_version: CONSENT_TEXT_VERSION };
  }

  /** Step 1 of a booking request: the filled contract for the customer to review. */
  async previewForBooking(userId: string, dto: BookingContractFieldsDto) {
    const bookingId = randomUUID();
    const p = await this.prepareForBooking(userId, dto, bookingId);
    return {
      success: true,
      data: {
        title: p.rendered.title,
        body: p.rendered.body,
        content_sha256: p.rendered.content_sha256,
        contract_type: p.vc.type,
        vendor_contract_version: p.vc.version,
        missing_fields: p.missing,
        missing_message: p.missing.length ? missingFieldsMessage(p.missing) : null,
        pricing: { price: p.data.vendor_price, service_fee: p.data.service_fee, total: p.data.total_price },
        preview_token: signPreview({ bid: bookingId, lid: dto.listing_id, uid: userId }),
        source_pdf_url: p.vc.file_key
          ? this.vendorContracts.downloadUrl(p.vc.file_key, userId, p.vc.id, p.vc.file_name || 'contract.pdf')
          : null,
        ...this.consentInfo(),
      },
    };
  }

  private signerRoleFor(userType?: string | null): ContractSignerRole {
    return userType === UserType.EVENT_PLANNER ? ContractSignerRole.PLANNER : ContractSignerRole.CUSTOMER;
  }

  private async storeSignatureImage(dataUrl: string | undefined, folder: string) {
    let buf: Buffer | null;
    try {
      buf = decodeSignatureImage(dataUrl);
    } catch (err) {
      if (err instanceof PdfValidationError) throw new BadRequestException(err.message);
      throw err;
    }
    if (!buf) return null;
    const key = PrivateStorage.newKey(folder, 'png');
    await PrivateStorage.put(key, buf);
    return key;
  }

  private signatureRow(
    contractId: string,
    userId: string,
    role: ContractSignerRole,
    sig: SignatureDto,
    contentSha: string,
    imageKey: string | null,
    email: string | null | undefined,
    meta: RequestMeta,
    signedAt = new Date(),
  ): Prisma.ContractSignatureUncheckedCreateInput {
    return {
      booking_contract_id: contractId,
      user_id: userId,
      role,
      legal_name: sig.legal_name.trim(),
      signer_email: email ?? null,
      signature_image_key: imageKey,
      consent_text_version: CONSENT_TEXT_VERSION,
      ip_address: meta.ip ?? null,
      user_agent: meta.userAgent?.slice(0, 1000) ?? null,
      app_version: sig.app_version ?? null,
      device_platform: sig.device_platform ?? null,
      document_sha256: contentSha,
      signed_at: signedAt,
    };
  }

  /**
   * Step 2: the customer signs and sends the request. Creates the booking, the frozen
   * contract snapshot and the customer's signature in one transaction.
   */
  async createSignedBooking(userId: string, dto: SignedBookingRequestDto, meta: RequestMeta) {
    const claims = verifyPreview(dto.preview_token);
    if (!claims || claims.uid !== userId || claims.lid !== dto.listing_id) {
      throw new BadRequestException('The contract preview has expired. Please review the contract again.');
    }
    if (await this.prisma.booking.findUnique({ where: { id: claims.bid }, select: { id: true } })) {
      throw new ConflictException('This booking request was already sent.');
    }

    const p = await this.prepareForBooking(userId, dto, claims.bid);
    if (p.missing.length) throw new BadRequestException(missingFieldsMessage(p.missing));
    if (p.rendered.content_sha256 !== dto.signature.content_sha256) {
      throw new ConflictException({
        message: 'The contract changed since you reviewed it. Please review and sign again.',
        error: 'CONTRACT_CHANGED',
      });
    }

    const imageKey = await this.storeSignatureImage(dto.signature.signature_image, `signatures/${userId}`);
    const role = this.signerRoleFor(p.customer.type);

    const booking = await this.prisma.$transaction(async (tx) => {
      const b = await tx.booking.create({
        data: {
          id: claims.bid,
          customer_id: userId,
          vendor_id: p.listing.vendor_id,
          listing_id: p.listing.id,
          scheduled_at: dto.scheduled_at ?? dto.event_start_at,
          event_start_at: dto.event_start_at,
          event_end_at: dto.event_end_at,
          venue_address: dto.venue_address,
          guest_count: dto.guest_count,
          message: dto.message,
          amount: p.listing.price,
          service_fee: this.serviceFee(p.listing.price),
          currency: 'usd',
          status: BookingStatus.PENDING,
        },
      });
      if (p.event) await tx.eventBooking.create({ data: { event_id: p.event.id, booking_id: b.id } });

      const contract = await tx.bookingContract.create({
        data: {
          booking_id: b.id,
          vendor_contract_id: p.vc.id,
          version: 1,
          status: BookingContractStatus.AWAITING_VENDOR,
          title: p.rendered.title,
          rendered_body: p.rendered.body,
          merge_data: p.data,
          source_pdf_key: p.vc.file_key,
          source_pdf_sha256: p.vc.file_sha256,
          content_sha256: p.rendered.content_sha256,
          verification_code: verificationCode(),
        },
      });
      await this.audit(tx, { booking_contract_id: contract.id, actor_id: userId, actor_role: role, action: ContractAuditAction.CREATED, meta });
      await tx.contractSignature.create({
        data: this.signatureRow(contract.id, userId, role, dto.signature, p.rendered.content_sha256, imageKey, p.customer.email, meta),
      });
      await this.audit(tx, { booking_contract_id: contract.id, actor_id: userId, actor_role: role, action: ContractAuditAction.SIGNED, meta });
      return b;
    });

    return booking;
  }

  // ─── Vendor countersign / execute ───────────────────────────────────────

  private async resolveVendorSignatureImage(vendorId: string, sig: SignatureDto) {
    const profile = await this.prisma.vendorProfile.findUnique({
      where: { user_id: vendorId },
      select: { saved_signature_key: true },
    });
    if (sig.use_saved_signature) {
      if (!profile?.saved_signature_key) throw new BadRequestException('You have no saved signature yet.');
      return profile.saved_signature_key;
    }
    const key = await this.storeSignatureImage(sig.signature_image, `signatures/${vendorId}`);
    if (key && sig.save_signature) {
      await this.prisma.vendorProfile.upsert({
        where: { user_id: vendorId },
        create: { user_id: vendorId, saved_signature_key: key },
        update: { saved_signature_key: key },
      });
    }
    return key;
  }

  /**
   * Accept & Sign. Returns null for legacy bookings created before contracts existed,
   * so they can still be confirmed.
   */
  async countersignForBooking(
    bookingId: string,
    vendorId: string,
    sig: SignatureDto | undefined,
    meta: RequestMeta,
    onExecuted: (tx: Tx) => Promise<unknown>,
  ) {
    const contracts = await this.prisma.bookingContract.findMany({
      where: { booking_id: bookingId },
      orderBy: { version: 'desc' },
    });
    if (!contracts.length) return null;
    const current = contracts.find((c) => c.status === BookingContractStatus.AWAITING_VENDOR && !c.supersedes_id);
    if (!current) throw new BadRequestException('There is no contract waiting for your signature on this booking.');
    if (!sig) throw new BadRequestException('Accept & Sign requires your signature on the contract.');
    if (sig.content_sha256 !== current.content_sha256) {
      throw new ConflictException('The contract you reviewed does not match. Please reload and sign again.');
    }
    const imageKey = await this.resolveVendorSignatureImage(vendorId, sig);
    return this.execute(current.id, vendorId, ContractSignerRole.VENDOR, sig, imageKey, meta, onExecuted);
  }

  private async certificateSigners(contractId: string, extra?: Prisma.ContractSignatureUncheckedCreateInput) {
    const sigs = await this.prisma.contractSignature.findMany({
      where: { booking_contract_id: contractId },
      orderBy: { signed_at: 'asc' },
    });
    const all: Array<Omit<CertificateSigner, 'signatureImage'> & { signature_image_key?: string | null }> = [
      ...sigs,
      ...(extra ? [{ ...extra, signed_at: extra.signed_at as Date }] : []),
    ].map((s: any) => ({
      role: s.role,
      legal_name: s.legal_name,
      email: s.signer_email,
      signed_at: new Date(s.signed_at),
      ip_address: s.ip_address,
      device_platform: s.device_platform,
      app_version: s.app_version,
      user_agent: s.user_agent,
      document_sha256: s.document_sha256,
      signature_image_key: s.signature_image_key,
    }));
    return Promise.all(
      all.map(async (s) => ({
        ...s,
        signatureImage: s.signature_image_key ? await PrivateStorage.get(s.signature_image_key).catch(() => null) : null,
      })),
    );
  }

  private verifyUrl(code: string) {
    return `${appConfig().app.client_app_url}/contracts/verify?code=${code}`;
  }

  /** Records the final signature, renders and stores the executed PDF, and marks it executed. */
  private async execute(
    contractId: string,
    signerId: string,
    role: ContractSignerRole,
    sig: SignatureDto,
    imageKey: string | null,
    meta: RequestMeta,
    onExecuted: (tx: Tx) => Promise<unknown>,
  ) {
    const contract = await this.prisma.bookingContract.findUniqueOrThrow({ where: { id: contractId } });
    const signer = await this.prisma.user.findUnique({ where: { id: signerId }, select: { email: true } });
    const executedAt = new Date();
    const row = this.signatureRow(contract.id, signerId, role, sig, contract.content_sha256, imageKey, signer?.email, meta, executedAt);

    const sourcePdf = contract.source_pdf_key ? await PrivateStorage.get(contract.source_pdf_key) : null;
    const pdf = await buildExecutedPdf({
      title: contract.title,
      renderedBody: contract.rendered_body,
      sourcePdf,
      certificate: {
        bookingId: contract.booking_id,
        verificationCode: contract.verification_code,
        contractVersion: contract.version,
        contentSha256: contract.content_sha256,
        timezone: (contract.merge_data as MergeData)?.timezone || 'UTC',
        executedAt,
        signers: await this.certificateSigners(contract.id, row),
        verifyUrl: this.verifyUrl(contract.verification_code),
      },
    });
    const pdfHash = sha256(pdf);
    const key = PrivateStorage.newKey(`contracts/${contract.booking_id}`, 'pdf');
    await PrivateStorage.put(key, pdf);

    const executed = await this.prisma.$transaction(async (tx) => {
      // the status guard in the WHERE prevents a double execution race
      const res = await tx.bookingContract.updateMany({
        where: { id: contract.id, status: contract.status },
        data: {
          status: BookingContractStatus.EXECUTED,
          executed_at: executedAt,
          executed_pdf_key: key,
          executed_pdf_sha256: pdfHash,
        },
      });
      if (res.count !== 1) throw new ConflictException('This contract was already signed.');
      await tx.contractSignature.create({ data: row });
      await this.audit(tx, {
        booking_contract_id: contract.id,
        actor_id: signerId,
        actor_role: role,
        action: role === ContractSignerRole.VENDOR ? ContractAuditAction.COUNTERSIGNED : ContractAuditAction.SIGNED,
        meta,
      });
      await this.audit(tx, {
        booking_contract_id: contract.id,
        actor_id: signerId,
        actor_role: role,
        action: ContractAuditAction.EXECUTED,
        meta,
        details: { executed_pdf_sha256: pdfHash },
      });
      await onExecuted(tx);
      return tx.bookingContract.findUniqueOrThrow({ where: { id: contract.id } });
    });

    void this.notifyExecuted(executed.id).catch((err) =>
      this.logger.warn(`Executed-contract notification failed: ${(err as Error).message}`),
    );
    return executed;
  }

  // ─── Voiding ────────────────────────────────────────────────────────────

  async voidPendingForBooking(bookingId: string, reason: string, actorId: string | null, meta: RequestMeta = {}) {
    const pending = await this.prisma.bookingContract.findMany({
      where: { booking_id: bookingId, status: { in: PENDING_STATUSES } },
      select: { id: true },
    });
    for (const c of pending) {
      await this.prisma.$transaction(async (tx) => {
        await tx.bookingContract.update({
          where: { id: c.id },
          data: { status: BookingContractStatus.VOID, voided_at: new Date(), void_reason: reason },
        });
        await this.audit(tx, { booking_contract_id: c.id, actor_id: actorId, action: ContractAuditAction.VOIDED, meta, details: { reason } });
      });
    }
    return pending.length;
  }

  // ─── Access ─────────────────────────────────────────────────────────────

  private isAdmin(user: AuthUser) {
    return user.type === UserType.ADMIN;
  }

  private async partyRole(booking: { id: string; customer_id: string; vendor_id: string }, userId: string) {
    if (booking.vendor_id === userId) return 'VENDOR';
    if (booking.customer_id === userId) return 'CUSTOMER';
    const planner = await this.prisma.eventBooking.findFirst({
      where: { booking_id: booking.id, event: { event_planner_id: userId } },
      select: { event_id: true },
    });
    return planner ? 'PLANNER' : null;
  }

  private async assertBookingAccess(bookingId: string, user: AuthUser) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId },
      select: { id: true, customer_id: true, vendor_id: true, status: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    const role = await this.partyRole(booking, user.userId);
    if (!role && !this.isAdmin(user)) throw new ForbiddenException('Access denied');
    return { booking, role: role ?? 'ADMIN' };
  }

  private async contractForUser(contractId: string, user: AuthUser) {
    const contract = await this.prisma.bookingContract.findUnique({
      where: { id: contractId },
      include: {
        booking: { select: { id: true, customer_id: true, vendor_id: true, status: true, listing: { select: { title: true } } } },
        signatures: { select: { role: true, legal_name: true, signed_at: true, user_id: true } },
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    const role = await this.partyRole(contract.booking, user.userId);
    if (!role && !this.isAdmin(user)) throw new ForbiddenException('Access denied');
    return { contract, role: role ?? 'ADMIN' };
  }

  private awaitingRole(status: BookingContractStatus) {
    if (status === BookingContractStatus.AWAITING_VENDOR) return 'VENDOR';
    if (status === BookingContractStatus.AWAITING_CUSTOMER) return 'CUSTOMER';
    return null;
  }

  private summary(c: any, myRole: string) {
    const awaiting = this.awaitingRole(c.status);
    const md = (c.merge_data ?? {}) as Record<string, unknown>;
    return {
      id: c.id,
      booking_id: c.booking_id,
      version: c.version,
      status: c.status,
      title: c.title,
      verification_code: c.verification_code,
      content_sha256: c.content_sha256,
      executed_at: c.executed_at,
      executed_pdf_sha256: c.executed_pdf_sha256,
      voided_at: c.voided_at,
      void_reason: c.void_reason,
      created_at: c.created_at,
      is_amendment: !!c.supersedes_id,
      supersedes_id: c.supersedes_id,
      amendment_changes: md.amendment_changes ?? null,
      has_source_pdf: !!c.source_pdf_key,
      awaiting_role: awaiting,
      my_role: myRole,
      can_sign: !!awaiting && (awaiting === myRole || (awaiting === 'CUSTOMER' && myRole === 'PLANNER')),
      signatures: (c.signatures ?? []).map((s: any) => ({ role: s.role, legal_name: s.legal_name, signed_at: s.signed_at })),
    };
  }

  async listForBooking(bookingId: string, user: AuthUser) {
    const { role } = await this.assertBookingAccess(bookingId, user);
    const contracts = await this.prisma.bookingContract.findMany({
      where: { booking_id: bookingId },
      include: { signatures: { select: { role: true, legal_name: true, signed_at: true } } },
      orderBy: { version: 'desc' },
    });
    const current =
      contracts.find((c) => c.status === BookingContractStatus.EXECUTED) ??
      contracts.find((c) => PENDING_STATUSES.includes(c.status)) ??
      contracts[0] ?? null;
    return {
      success: true,
      data: {
        current_id: current?.id ?? null,
        contracts: contracts.map((c) => this.summary(c, role)),
        ...this.consentInfo(),
      },
    };
  }

  async getOne(contractId: string, user: AuthUser, meta: RequestMeta) {
    const { contract, role } = await this.contractForUser(contractId, user);
    await this.audit(this.prisma, {
      booking_contract_id: contract.id,
      actor_id: user.userId,
      actor_role: role,
      action: role === 'ADMIN' ? ContractAuditAction.ADMIN_VIEWED : ContractAuditAction.VIEWED,
      meta,
    });
    return {
      success: true,
      data: {
        ...this.summary(contract, role),
        body: contract.rendered_body,
        listing_title: contract.booking.listing?.title ?? null,
        ...this.consentInfo(),
      },
    };
  }

  async downloadLink(contractId: string, user: AuthUser, kind: 'executed' | 'source' | 'draft') {
    const { contract } = await this.contractForUser(contractId, user);
    let key: string;
    let name: string;
    if (kind === 'executed') {
      if (!contract.executed_pdf_key) throw new BadRequestException('This contract has not been executed yet.');
      key = contract.executed_pdf_key;
      name = `vendly-contract-${contract.booking_id}-v${contract.version}.pdf`;
    } else if (kind === 'source') {
      if (!contract.source_pdf_key) throw new BadRequestException("This contract has no vendor PDF.");
      key = contract.source_pdf_key;
      name = `vendor-contract-${contract.booking_id}.pdf`;
    } else {
      key = `draft:${contract.id}`;
      name = `vendly-contract-${contract.booking_id}-v${contract.version}-draft.pdf`;
    }
    return { success: true, data: { url: this.vendorContracts.downloadUrl(key, user.userId, contract.id, name) } };
  }

  /** Serves a file for a short-lived signed link. */
  async resolveFile(token: string, meta: RequestMeta) {
    const claims = SignedUrl.verify(token);
    if (!claims) throw new ForbiddenException('This download link has expired.');

    if (claims.key.startsWith('draft:')) {
      const c = await this.prisma.bookingContract.findUniqueOrThrow({ where: { id: claims.key.slice(6) } });
      const src = c.source_pdf_key ? await PrivateStorage.get(c.source_pdf_key) : null;
      return { buffer: Buffer.from(await buildDraftPdf(c.title, c.rendered_body, src)), name: claims.name, type: 'application/pdf' };
    }
    if (claims.key.startsWith('zip:')) {
      return { buffer: await this.buildEventZip(claims.key.slice(4)), name: claims.name, type: 'application/zip' };
    }

    const buffer = await PrivateStorage.get(claims.key).catch(() => {
      throw new NotFoundException('File not found');
    });
    const c = await this.prisma.bookingContract.findFirst({
      where: { id: claims.cid, executed_pdf_key: claims.key },
      select: { id: true },
    });
    if (c) {
      await this.audit(this.prisma, { booking_contract_id: c.id, actor_id: claims.uid, action: ContractAuditAction.DOWNLOADED, meta });
    }
    return { buffer, name: claims.name, type: 'application/pdf' };
  }

  // ─── Verification ───────────────────────────────────────────────────────

  async verifyFile(buffer: Buffer | undefined, meta: RequestMeta) {
    if (!buffer?.length) throw new BadRequestException('Upload the PDF to verify.');
    const hash = sha256(buffer);
    const c = await this.prisma.bookingContract.findFirst({ where: { executed_pdf_sha256: hash } });
    if (!c) return { success: true, data: { valid: false, sha256: hash } };
    await this.audit(this.prisma, { booking_contract_id: c.id, action: ContractAuditAction.VERIFIED, meta, details: { sha256: hash } });
    return {
      success: true,
      data: {
        valid: true,
        sha256: hash,
        booking_id: c.booking_id,
        version: c.version,
        status: c.status,
        executed_at: c.executed_at,
        verification_code: c.verification_code,
      },
    };
  }

  async verifyCode(code: string) {
    const c = await this.prisma.bookingContract.findUnique({ where: { verification_code: (code ?? '').toUpperCase() } });
    if (!c) throw new NotFoundException('No contract matches this verification code.');
    return {
      success: true,
      data: {
        booking_id: c.booking_id,
        version: c.version,
        status: c.status,
        executed_at: c.executed_at,
        executed_pdf_sha256: c.executed_pdf_sha256,
      },
    };
  }

  // ─── Amendments ─────────────────────────────────────────────────────────

  private async amendmentContext(bookingId: string, user: AuthUser, dto: AmendmentPreviewDto) {
    const { booking, role } = await this.assertBookingAccess(bookingId, user);
    if (role === 'ADMIN') throw new ForbiddenException('Only the booking parties can amend a contract.');
    if (([BookingStatus.COMPLETED, BookingStatus.CANCELLED, BookingStatus.REJECTED] as BookingStatus[]).includes(booking.status)) {
      throw new BadRequestException(`A ${booking.status.toLowerCase()} booking can't be amended.`);
    }
    const contracts = await this.prisma.bookingContract.findMany({
      where: { booking_id: bookingId },
      include: { vendor_contract: { include: { template: true } } },
      orderBy: { version: 'desc' },
    });
    const current = contracts.find((c) => c.status === BookingContractStatus.EXECUTED);
    if (!current) throw new BadRequestException('Only an executed contract can be amended.');
    if (contracts.some((c) => c.supersedes_id && PENDING_STATUSES.includes(c.status))) {
      throw new ConflictException('An amendment is already waiting for a signature.');
    }

    const changes = Object.fromEntries(
      Object.entries(dto.changes ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''),
    ) as AmendmentChangesDto;
    if (role !== 'VENDOR' && (changes.amount !== undefined || changes.cancellation_policy !== undefined)) {
      throw new ForbiddenException('Only the vendor can change the price or cancellation terms.');
    }
    if (!Object.keys(changes).length) throw new BadRequestException('Nothing to change.');

    const full = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        listing: true,
        vendor: { select: vendorSelect },
        customer: { select: { id: true, name: true, email: true, type: true } },
        event_bookings: { include: { event: { select: { id: true, name: true, venue: true, guest_count: true } } } },
      },
    });
    const prevData = current.merge_data as MergeData;
    const nextBooking = {
      id: full.id,
      scheduled_at: changes.scheduled_at ?? changes.event_start_at ?? full.scheduled_at,
      event_start_at: changes.event_start_at ?? full.event_start_at,
      event_end_at: changes.event_end_at ?? full.event_end_at,
      venue_address: changes.venue_address ?? full.venue_address,
      guest_count: changes.guest_count ?? full.guest_count,
      message: full.message,
      amount: changes.amount ?? full.amount,
      service_fee: changes.amount !== undefined ? this.serviceFee(changes.amount) : full.service_fee,
      currency: full.currency,
    };
    const vc = current.vendor_contract as ResolvedVendorContract;
    const fieldValues = {
      ...(vc.field_values as Record<string, unknown>),
      ...(changes.cancellation_policy ? { cancellation_policy: changes.cancellation_policy } : {}),
    };
    const version = contracts[0].version + 1;
    const data = buildMergeData({
      booking: nextBooking,
      listing: full.listing,
      vendor: full.vendor,
      customer: full.customer,
      event: full.event_bookings[0]?.event ?? null,
      fieldValues,
      additionalTerms: vc.additional_terms,
      contractVersion: version,
      timezone: dto.timezone || prevData?.timezone,
    });
    const changed = Object.keys(changes).map(fieldLabel);
    const rendered = this.renderFor(vc, data);
    const body = `${rendered.body}\n\n## Amendment\nThis version replaces contract version ${current.version} (verification ${current.verification_code}). Changed: ${changed.join(', ')}. Until both parties sign this amendment, version ${current.version} remains in force.`;
    const content = contentHash(body, vc.file_sha256);
    const missing = missingFields(rendered.required, data);
    const serialisedChanges = Object.fromEntries(
      Object.entries(changes).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]),
    );
    return { role, current, vc, version, data: { ...data, amendment_changes: serialisedChanges } as any, title: rendered.title, body, content, missing, full, changed };
  }

  async previewAmendment(bookingId: string, user: AuthUser, dto: AmendmentPreviewDto) {
    const a = await this.amendmentContext(bookingId, user, dto);
    return {
      success: true,
      data: {
        title: a.title,
        body: a.body,
        content_sha256: a.content,
        version: a.version,
        changes: a.data.amendment_changes,
        missing_fields: a.missing,
        missing_message: a.missing.length ? missingFieldsMessage(a.missing) : null,
        ...this.consentInfo(),
      },
    };
  }

  async requestAmendment(bookingId: string, user: AuthUser, dto: AmendmentRequestDto, meta: RequestMeta) {
    const a = await this.amendmentContext(bookingId, user, dto);
    if (a.missing.length) throw new BadRequestException(missingFieldsMessage(a.missing));
    if (a.content !== dto.signature.content_sha256) {
      throw new ConflictException('The amendment changed since you reviewed it. Please review and sign again.');
    }
    const isVendor = a.role === 'VENDOR';
    const role = isVendor ? ContractSignerRole.VENDOR : this.signerRoleFor(a.full.customer.type);
    const imageKey = isVendor
      ? await this.resolveVendorSignatureImage(user.userId, dto.signature)
      : await this.storeSignatureImage(dto.signature.signature_image, `signatures/${user.userId}`);
    const signer = isVendor ? a.full.vendor : a.full.customer;

    const created = await this.prisma.$transaction(async (tx) => {
      const c = await tx.bookingContract.create({
        data: {
          booking_id: bookingId,
          vendor_contract_id: a.vc.id,
          version: a.version,
          status: isVendor ? BookingContractStatus.AWAITING_CUSTOMER : BookingContractStatus.AWAITING_VENDOR,
          title: a.title,
          rendered_body: a.body,
          merge_data: a.data,
          source_pdf_key: a.current.source_pdf_key,
          source_pdf_sha256: a.current.source_pdf_sha256,
          content_sha256: a.content,
          verification_code: verificationCode(),
          supersedes_id: a.current.id,
        },
      });
      await this.audit(tx, { booking_contract_id: c.id, actor_id: user.userId, actor_role: role, action: ContractAuditAction.CREATED, meta, details: { amends: a.current.id, changes: a.data.amendment_changes } });
      await tx.contractSignature.create({
        data: this.signatureRow(c.id, user.userId, role, dto.signature, a.content, imageKey, signer.email, meta),
      });
      await this.audit(tx, { booking_contract_id: c.id, actor_id: user.userId, actor_role: role, action: ContractAuditAction.SIGNED, meta });
      return c;
    });

    const other = isVendor ? a.full.customer : a.full.vendor;
    void this.notify(other.id, other.email, other.name, {
      subject: `Amendment ready to sign: ${a.full.listing?.title ?? 'your booking'}`,
      message: `${signer.name ?? 'The other party'} proposed changes to your contract (${a.changed.join(', ')}) and signed them. Please review and sign. The current contract stays in force until you do.`,
      bookingId,
      contractId: created.id,
      listingTitle: a.full.listing?.title,
    });
    return { success: true, data: this.summary({ ...created, signatures: [] }, a.role) };
  }

  /** Counterparty signs a pending amendment, which executes it and supersedes the old version. */
  async signAmendment(contractId: string, user: AuthUser, dto: SignatureDto, meta: RequestMeta) {
    const { contract, role } = await this.contractForUser(contractId, user);
    if (!contract.supersedes_id) {
      throw new BadRequestException('Use Accept & Sign on the booking to countersign this contract.');
    }
    const awaiting = this.awaitingRole(contract.status);
    const allowed = awaiting === role || (awaiting === 'CUSTOMER' && role === 'PLANNER');
    if (!awaiting || !allowed) throw new ForbiddenException('This contract is not waiting for your signature.');
    if (dto.content_sha256 !== contract.content_sha256) {
      throw new ConflictException('The contract you reviewed does not match. Please reload and sign again.');
    }
    const isVendor = role === 'VENDOR';
    const customer = await this.prisma.user.findUnique({ where: { id: contract.booking.customer_id }, select: { type: true } });
    const signerRole = isVendor ? ContractSignerRole.VENDOR : this.signerRoleFor(customer?.type);
    const imageKey = isVendor
      ? await this.resolveVendorSignatureImage(user.userId, dto)
      : await this.storeSignatureImage(dto.signature_image, `signatures/${user.userId}`);
    const changes = ((contract as any).merge_data?.amendment_changes ?? {}) as Record<string, any>;

    const executed = await this.execute(contract.id, user.userId, signerRole, dto, imageKey, meta, async (tx) => {
      await tx.bookingContract.update({
        where: { id: contract.supersedes_id! },
        data: { status: BookingContractStatus.SUPERSEDED },
      });
      await this.audit(tx, { booking_contract_id: contract.supersedes_id, actor_id: user.userId, action: ContractAuditAction.SUPERSEDED, meta, details: { by: contract.id } });
      const bookingUpdate: Prisma.BookingUpdateInput = {};
      if (changes.scheduled_at) bookingUpdate.scheduled_at = new Date(changes.scheduled_at);
      if (changes.event_start_at) {
        bookingUpdate.event_start_at = new Date(changes.event_start_at);
        if (!changes.scheduled_at) bookingUpdate.scheduled_at = new Date(changes.event_start_at);
      }
      if (changes.event_end_at) bookingUpdate.event_end_at = new Date(changes.event_end_at);
      if (changes.venue_address) bookingUpdate.venue_address = changes.venue_address;
      if (changes.guest_count) bookingUpdate.guest_count = Number(changes.guest_count);
      // price differences are settled under the payment rules, not here
      if (changes.amount !== undefined) {
        bookingUpdate.amount = Number(changes.amount);
        bookingUpdate.service_fee = this.serviceFee(changes.amount);
      }
      if (Object.keys(bookingUpdate).length) {
        await tx.booking.update({ where: { id: contract.booking_id }, data: bookingUpdate });
      }
    });
    return { success: true, data: this.summary({ ...executed, signatures: [] }, role) };
  }

  async declineAmendment(contractId: string, user: AuthUser, meta: RequestMeta) {
    const { contract, role } = await this.contractForUser(contractId, user);
    if (!contract.supersedes_id || !PENDING_STATUSES.includes(contract.status)) {
      throw new BadRequestException('Only a pending amendment can be declined or withdrawn.');
    }
    if (role === 'ADMIN') throw new ForbiddenException('Access denied');
    await this.prisma.$transaction(async (tx) => {
      await tx.bookingContract.update({
        where: { id: contract.id },
        data: { status: BookingContractStatus.VOID, voided_at: new Date(), void_reason: `Declined by ${role.toLowerCase()}` },
      });
      await this.audit(tx, { booking_contract_id: contract.id, actor_id: user.userId, actor_role: role, action: ContractAuditAction.VOIDED, meta, details: { reason: 'declined' } });
    });
    return { success: true };
  }

  // ─── Event planners ─────────────────────────────────────────────────────

  private async assertEventOwner(eventId: string, user: AuthUser) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true, name: true, event_planner_id: true } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.event_planner_id !== user.userId && !this.isAdmin(user)) throw new ForbiddenException('Access denied');
    return event;
  }

  async eventContracts(eventId: string, user: AuthUser) {
    await this.assertEventOwner(eventId, user);
    const links = await this.prisma.eventBooking.findMany({
      where: { event_id: eventId },
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            listing: { select: { title: true } },
            vendor: { select: { id: true, name: true, vendorProfile: { select: { business_name: true } } } },
            contracts: { orderBy: { version: 'desc' }, select: { id: true, status: true, version: true, executed_at: true, supersedes_id: true } },
          },
        },
      },
    });
    const data = links.map(({ booking }) => {
      const current =
        booking.contracts.find((c) => c.status === BookingContractStatus.EXECUTED) ??
        booking.contracts.find((c) => PENDING_STATUSES.includes(c.status)) ??
        booking.contracts[0] ?? null;
      return {
        booking_id: booking.id,
        booking_status: booking.status,
        listing_title: booking.listing?.title ?? null,
        vendor_name: booking.vendor.vendorProfile?.business_name || booking.vendor.name,
        contract: current,
        pending_amendment: booking.contracts.some((c) => c.supersedes_id && PENDING_STATUSES.includes(c.status)),
      };
    });
    return { success: true, data, executed_count: data.filter((d) => d.contract?.status === BookingContractStatus.EXECUTED).length };
  }

  async eventZipLink(eventId: string, user: AuthUser) {
    const event = await this.assertEventOwner(eventId, user);
    const count = await this.prisma.bookingContract.count({
      where: { status: BookingContractStatus.EXECUTED, booking: { event_bookings: { some: { event_id: eventId } } } },
    });
    if (!count) throw new BadRequestException('No executed contracts for this event yet.');
    const name = `${event.name.replace(/[^\w-]+/g, '-').slice(0, 60) || 'event'}-contracts.zip`;
    return { success: true, data: { url: this.vendorContracts.downloadUrl(`zip:${eventId}`, user.userId, eventId, name) } };
  }

  async buildEventZip(eventId: string) {
    const contracts = await this.prisma.bookingContract.findMany({
      where: { status: BookingContractStatus.EXECUTED, booking: { event_bookings: { some: { event_id: eventId } } } },
      include: { booking: { select: { vendor: { select: { name: true, vendorProfile: { select: { business_name: true } } } } } } },
    });
    const zip = new JSZip();
    for (const c of contracts) {
      if (!c.executed_pdf_key) continue;
      const vendor = (c.booking.vendor.vendorProfile?.business_name || c.booking.vendor.name || 'vendor').replace(/[^\w-]+/g, '-');
      zip.file(`${vendor}-${c.booking_id.slice(0, 8)}-v${c.version}.pdf`, await PrivateStorage.get(c.executed_pdf_key));
    }
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  // ─── Admin ──────────────────────────────────────────────────────────────

  async adminBookingContracts(bookingId: string, adminId: string, meta: RequestMeta) {
    const contracts = await this.prisma.bookingContract.findMany({
      where: { booking_id: bookingId },
      include: {
        signatures: true,
        auditEvents: { orderBy: { created_at: 'asc' }, include: { actor: { select: { id: true, name: true, email: true } } } },
        vendor_contract: { select: { id: true, type: true, version: true, status: true } },
      },
      orderBy: { version: 'desc' },
    });
    if (!contracts.length) throw new NotFoundException('No contracts for this booking.');
    for (const c of contracts) {
      await this.audit(this.prisma, { booking_contract_id: c.id, actor_id: adminId, actor_role: 'ADMIN', action: ContractAuditAction.ADMIN_VIEWED, meta });
    }
    return {
      success: true,
      data: contracts.map((c) => ({
        ...c,
        signatures: c.signatures.map(({ signature_image_key, ...s }) => ({ ...s, has_signature_image: !!signature_image_key })),
      })),
    };
  }

  async adminDisableVendorContract(id: string, adminId: string, reason: string, meta: RequestMeta) {
    const vc = await this.prisma.vendorContract.findUnique({
      where: { id },
      include: { listings: true, vendor: { select: { id: true, name: true, email: true } } },
    });
    if (!vc) throw new NotFoundException('Vendor contract not found');
    if (vc.status === VendorContractStatus.DISABLED) throw new BadRequestException('Already disabled.');

    await this.prisma.$transaction(async (tx) => {
      await tx.vendorContract.update({
        where: { id },
        data: { status: VendorContractStatus.DISABLED, disabled_reason: reason, disabled_at: new Date(), disabled_by_id: adminId },
      });
      await this.audit(tx, { vendor_contract_id: id, actor_id: adminId, actor_role: 'ADMIN', action: ContractAuditAction.VENDOR_CONTRACT_DISABLED, meta, details: { reason } });
    });
    // move the vendor to the Vendly default for the same listings
    await this.vendorContracts.createDefaultFromProfile(
      vc.vendor_id,
      vc.applies_to_all ? [] : vc.listings.map((l) => l.listing_id),
    );
    void this.notify(vc.vendor.id, vc.vendor.email, vc.vendor.name, {
      subject: 'Your uploaded contract was disabled',
      message: `An administrator disabled your uploaded contract. Reason: ${reason}. New bookings now use the Vendly default contract. You can review or update it in Contracts.`,
      ctaPath: '/vendor/contracts',
    });
    return { success: true };
  }

  // ─── Notifications ──────────────────────────────────────────────────────

  async notify(
    userId: string,
    email: string | null | undefined,
    name: string | null | undefined,
    n: { subject: string; message: string; bookingId?: string; contractId?: string; listingTitle?: string | null; ctaPath?: string },
  ) {
    try {
      await this.push.sendToUser(userId, {
        title: n.subject,
        body: n.message.slice(0, 180),
        data: { type: 'contract', bookingId: n.bookingId, contractId: n.contractId },
      });
      if (email) {
        const path = n.ctaPath ?? (n.contractId ? `/contracts/${n.contractId}` : '/bookings');
        await this.mail.sendBookingNotification({
          to: email,
          recipientName: name ?? '',
          subject: n.subject,
          message: n.message,
          status: 'CONTRACT',
          listingTitle: n.listingTitle ?? 'Your booking',
          ctaUrl: `${appConfig().app.client_app_url}${path}`,
        });
      }
    } catch (err) {
      this.logger.warn(`Contract notification to ${userId} failed: ${(err as Error).message}`);
    }
  }

  async notifyCustomerSigned(bookingId: string) {
    const c = await this.prisma.bookingContract.findFirst({
      where: { booking_id: bookingId, status: BookingContractStatus.AWAITING_VENDOR },
      include: { booking: { include: { vendor: true, customer: true, listing: true } } },
    });
    if (!c) return;
    await this.notify(c.booking.vendor_id, c.booking.vendor.email, c.booking.vendor.name, {
      subject: `Signed request: ${c.booking.listing?.title ?? 'new booking'}`,
      message: `${c.booking.customer.name ?? 'A customer'} signed the contract and sent a booking request. Review it and tap Accept & Sign to confirm.`,
      bookingId,
      contractId: c.id,
      listingTitle: c.booking.listing?.title,
      ctaPath: `/vendor/bookings/${bookingId}`,
    });
  }

  private async notifyExecuted(contractId: string) {
    const c = await this.prisma.bookingContract.findUniqueOrThrow({
      where: { id: contractId },
      include: { booking: { include: { vendor: true, customer: true, listing: true } } },
    });
    const parties = [c.booking.customer, c.booking.vendor];
    for (const p of parties) {
      await this.notify(p.id, p.email, p.name, {
        subject: `Contract signed: ${c.booking.listing?.title ?? 'your booking'}`,
        message: `The contract for booking ${c.booking_id} is now executed (version ${c.version}, verification ${c.verification_code}). Download the signed PDF from the booking.`,
        bookingId: c.booking_id,
        contractId: c.id,
        listingTitle: c.booking.listing?.title,
      });
      await this.audit(this.prisma, { booking_contract_id: c.id, action: ContractAuditAction.EMAILED, details: { to: p.id } });
    }
  }

  /** 24h reminders for unsigned contracts; 48h notice to both sides for stalled amendments. */
  @Cron(CronExpression.EVERY_HOUR)
  async sendReminders(now = new Date()) {
    const pending = await this.prisma.bookingContract.findMany({
      where: {
        status: { in: [BookingContractStatus.AWAITING_CUSTOMER, BookingContractStatus.AWAITING_VENDOR] },
        created_at: { lte: new Date(now.getTime() - 24 * HOUR) },
      },
      include: { booking: { include: { vendor: true, customer: true, listing: true } } },
      take: 200,
    });
    let sent = 0;
    for (const c of pending) {
      const age = now.getTime() - c.created_at.getTime();
      const last = c.last_reminder_at?.getTime() ?? 0;
      const signer = c.status === BookingContractStatus.AWAITING_VENDOR ? c.booking.vendor : c.booking.customer;
      const title = c.booking.listing?.title ?? 'your booking';

      const amendmentNoticeDue = !!c.supersedes_id && age >= 48 * HOUR && last < c.created_at.getTime() + 48 * HOUR;
      if (amendmentNoticeDue) {
        for (const p of [c.booking.vendor, c.booking.customer]) {
          await this.notify(p.id, p.email, p.name, {
            subject: `Amendment still unsigned: ${title}`,
            message: 'A contract amendment has been waiting for a signature for 48 hours. The original contract remains in force until the amendment is signed.',
            bookingId: c.booking_id,
            contractId: c.id,
            listingTitle: title,
          });
        }
      } else if (!c.last_reminder_at) {
        await this.notify(signer.id, signer.email, signer.name, {
          subject: `Contract waiting for your signature: ${title}`,
          message: 'A contract has been waiting for your signature for over 24 hours.',
          bookingId: c.booking_id,
          contractId: c.id,
          listingTitle: title,
          ctaPath: c.status === BookingContractStatus.AWAITING_VENDOR && !c.supersedes_id ? `/vendor/bookings/${c.booking_id}` : undefined,
        });
      } else {
        continue;
      }
      await this.prisma.bookingContract.update({ where: { id: c.id }, data: { last_reminder_at: now } });
      sent++;
    }
    return sent;
  }
}
