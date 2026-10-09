import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  ContractCategory,
  ContractTemplateStatus,
  Prisma,
  VendorContractStatus,
  VendorContractType,
} from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CANCELLATION_PRESETS,
  CATEGORY_LABELS,
  CONSENT_TEXT,
  CONSENT_TEXT_VERSION,
  MAX_ADDITIONAL_TERMS,
  UPLOADED_ADDENDUM_BODY,
  UPLOADED_REQUIRED_FIELDS,
  defaultTemplates,
  vendorFieldsFor,
} from './contract-templates';
import { buildMergeData, fieldLabel, renderTemplate, sha256 } from './contract-merge';
import { PdfValidationError, validateUploadedPdf } from './contract-pdf';
import { PrivateStorage, SignedUrl } from './private-storage';
import { AdminTemplateDto, VendorDefaultContractDto, VendorUploadContractDto } from './dto/contracts.dto';

const UPLOAD_FIELDS = ['business_legal_name', 'business_address', 'cancellation_policy', 'governing_law'];

export type ResolvedVendorContract = Prisma.VendorContractGetPayload<{ include: { template: true } }>;

@Injectable()
export class VendorContractsService implements OnModuleInit {
  private readonly logger = new Logger(VendorContractsService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.ensureDefaultTemplates();
    } catch (err) {
      this.logger.warn(`Could not seed contract templates: ${(err as Error).message}`);
    }
  }

  /** Creates version 1 of each category template the first time the app starts. */
  async ensureDefaultTemplates() {
    for (const t of defaultTemplates()) {
      const exists = await this.prisma.contractTemplate.findFirst({ where: { category: t.category } });
      if (exists) continue;
      await this.prisma.contractTemplate.create({
        data: { ...t, version: 1, status: ContractTemplateStatus.ACTIVE },
      });
    }
  }

  // ─── Templates ──────────────────────────────────────────────────────────

  async listActiveTemplates() {
    const templates = await this.prisma.contractTemplate.findMany({
      where: { status: ContractTemplateStatus.ACTIVE },
      orderBy: { category: 'asc' },
    });
    return {
      success: true,
      data: {
        templates: templates.map((t) => ({
          id: t.id,
          category: t.category,
          category_label: CATEGORY_LABELS[t.category],
          version: t.version,
          title: t.title,
          fields: vendorFieldsFor(t.category),
        })),
        cancellation_presets: CANCELLATION_PRESETS,
        max_additional_terms: MAX_ADDITIONAL_TERMS,
        consent_text: CONSENT_TEXT,
        consent_text_version: CONSENT_TEXT_VERSION,
        upload_fields: vendorFieldsFor(ContractCategory.GENERAL).filter((f) => UPLOAD_FIELDS.includes(f.key)),
      },
    };
  }

  async activeTemplate(category: ContractCategory) {
    const t = await this.prisma.contractTemplate.findFirst({
      where: { category, status: ContractTemplateStatus.ACTIVE },
      orderBy: { version: 'desc' },
    });
    if (!t) throw new BadRequestException(`No active ${CATEGORY_LABELS[category]} template is available.`);
    return t;
  }

  // ─── Vendor setup ───────────────────────────────────────────────────────

  async listForVendor(vendorId: string) {
    const contracts = await this.prisma.vendorContract.findMany({
      where: { vendor_id: vendorId },
      include: {
        template: { select: { id: true, category: true, version: true, title: true } },
        listings: { select: { listing_id: true } },
      },
      orderBy: { version: 'desc' },
    });
    const active = contracts.filter((c) => c.status === VendorContractStatus.ACTIVE);
    const profile = await this.prisma.vendorProfile.findUnique({
      where: { user_id: vendorId },
      select: { saved_signature_key: true },
    });
    return {
      success: true,
      data: {
        has_active_contract: active.length > 0,
        has_saved_signature: !!profile?.saved_signature_key,
        active: active.map((c) => this.present(c)),
        history: contracts.filter((c) => c.status !== VendorContractStatus.ACTIVE).map((c) => this.present(c)),
      },
    };
  }

  private present(c: any) {
    return {
      id: c.id,
      type: c.type,
      version: c.version,
      status: c.status,
      template: c.template ?? null,
      field_values: c.field_values,
      additional_terms: c.additional_terms,
      file_name: c.file_name,
      file_sha256: c.file_sha256,
      applies_to_all: c.applies_to_all,
      listing_ids: (c.listings ?? []).map((l: any) => l.listing_id),
      disabled_reason: c.disabled_reason,
      disabled_at: c.disabled_at,
      created_at: c.created_at,
    };
  }

  private validateFieldValues(category: ContractCategory, values: Record<string, string>, onlyKeys?: string[]) {
    const defs = vendorFieldsFor(category).filter((f) => !onlyKeys || onlyKeys.includes(f.key));
    const allowed = new Set(defs.map((d) => d.key));
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(values ?? {})) {
      if (!allowed.has(k)) continue;
      const s = String(v ?? '').trim();
      if (s.length > 5000) throw new BadRequestException(`${fieldLabel(k)} is too long.`);
      if (s) clean[k] = s;
    }
    for (const d of defs) {
      if (d.type === 'select' && clean[d.key] && !d.options?.some((o) => o.value === clean[d.key])) {
        throw new BadRequestException(`Invalid value for ${d.label}.`);
      }
      if ((d.type === 'money' || d.type === 'number') && clean[d.key] && !Number.isFinite(Number(clean[d.key]))) {
        throw new BadRequestException(`${d.label} must be a number.`);
      }
    }
    const missing = defs.filter((d) => d.required && !clean[d.key]).map((d) => d.label);
    if (missing.length) throw new BadRequestException(`Please fill in: ${missing.join(', ')}.`);
    return clean;
  }

  private async validateListings(vendorId: string, appliesToAll: boolean, listingIds: string[]) {
    if (appliesToAll) return [];
    if (!listingIds.length) throw new BadRequestException('Choose at least one listing or apply to all listings.');
    const owned = await this.prisma.vendorListing.count({
      where: { id: { in: listingIds }, vendor_id: vendorId, deleted_at: null },
    });
    if (owned !== new Set(listingIds).size) throw new ForbiddenException('One or more listings are not yours.');
    return [...new Set(listingIds)];
  }

  /**
   * New versions apply to future bookings only. Older active contracts that covered the
   * same listings are archived; signed booking contracts keep their frozen snapshot.
   */
  private async createVersion(
    vendorId: string,
    data: Omit<Prisma.VendorContractUncheckedCreateInput, 'vendor_id' | 'version'>,
    listingIds: string[],
    replaceId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.vendorContract.findFirst({
        where: { vendor_id: vendorId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const created = await tx.vendorContract.create({
        data: {
          ...data,
          vendor_id: vendorId,
          version: (last?.version ?? 0) + 1,
          listings: listingIds.length ? { create: listingIds.map((listing_id) => ({ listing_id })) } : undefined,
        },
        include: { template: true, listings: true },
      });

      const others = await tx.vendorContract.findMany({
        where: { vendor_id: vendorId, status: VendorContractStatus.ACTIVE, id: { not: created.id } },
        include: { listings: true },
      });
      for (const o of others) {
        const replaced = o.id === replaceId || (data.applies_to_all && o.applies_to_all);
        if (replaced) {
          await tx.vendorContract.update({ where: { id: o.id }, data: { status: VendorContractStatus.ARCHIVED } });
          continue;
        }
        if (!o.applies_to_all && listingIds.length) {
          await tx.vendorContractListing.deleteMany({
            where: { vendor_contract_id: o.id, listing_id: { in: listingIds } },
          });
          const left = await tx.vendorContractListing.count({ where: { vendor_contract_id: o.id } });
          if (!left) {
            await tx.vendorContract.update({ where: { id: o.id }, data: { status: VendorContractStatus.ARCHIVED } });
          }
        }
      }
      return created;
    });
  }

  async createDefault(vendorId: string, dto: VendorDefaultContractDto, replaceId?: string) {
    const template = await this.activeTemplate(dto.category);
    const fieldValues = this.validateFieldValues(dto.category, dto.field_values);
    const appliesToAll = dto.applies_to_all ?? true;
    const listingIds = await this.validateListings(vendorId, appliesToAll, dto.listing_ids ?? []);
    if (replaceId) await this.ownedContract(vendorId, replaceId);

    const created = await this.createVersion(
      vendorId,
      {
        type: VendorContractType.DEFAULT,
        template_id: template.id,
        field_values: fieldValues,
        additional_terms: dto.additional_terms?.trim() || null,
        applies_to_all: appliesToAll,
      },
      listingIds,
      replaceId,
    );
    return { success: true, data: this.present(created) };
  }

  async upload(vendorId: string, file: Express.Multer.File | undefined, dto: VendorUploadContractDto, replaceId?: string) {
    try {
      await validateUploadedPdf(file?.buffer);
    } catch (err) {
      if (err instanceof PdfValidationError) throw new BadRequestException(err.message);
      throw err;
    }
    const fieldValues = this.validateFieldValues(ContractCategory.GENERAL, dto.field_values, UPLOAD_FIELDS);
    const appliesToAll = dto.applies_to_all ?? true;
    const listingIds = await this.validateListings(vendorId, appliesToAll, dto.listing_ids ?? []);
    if (replaceId) await this.ownedContract(vendorId, replaceId);

    const key = PrivateStorage.newKey(`vendor-contracts/${vendorId}`, 'pdf');
    await PrivateStorage.put(key, file!.buffer);

    const created = await this.createVersion(
      vendorId,
      {
        type: VendorContractType.UPLOADED,
        field_values: fieldValues,
        file_key: key,
        file_sha256: sha256(file!.buffer),
        file_name: (file!.originalname || 'contract.pdf').slice(0, 255),
        ownership_confirmed_at: new Date(),
        applies_to_all: appliesToAll,
      },
      listingIds,
      replaceId,
    );
    return { success: true, data: this.present(created) };
  }

  /** One-tap "Use Vendly default": General template filled from the vendor profile. */
  async useDefault(vendorId: string) {
    const created = await this.createDefaultFromProfile(vendorId);
    return { success: true, data: this.present(created) };
  }

  async createDefaultFromProfile(vendorId: string, listingIds: string[] = []) {
    const vendor = await this.prisma.user.findUnique({
      where: { id: vendorId },
      select: { name: true, address: true, state: true, country: true, vendorProfile: { select: { business_name: true, address: true } } },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    const template = await this.activeTemplate(ContractCategory.GENERAL);
    const law = [vendor.state, vendor.country].filter(Boolean).join(', ');
    return this.createVersion(
      vendorId,
      {
        type: VendorContractType.DEFAULT,
        template_id: template.id,
        field_values: {
          business_legal_name: vendor.vendorProfile?.business_name || vendor.name || '',
          business_address: vendor.vendorProfile?.address || vendor.address || '',
          cancellation_policy: 'moderate',
          governing_law: law || "the state or country of the Vendor's principal place of business",
        },
        applies_to_all: listingIds.length === 0,
      },
      listingIds,
    );
  }

  async archive(vendorId: string, id: string) {
    const c = await this.ownedContract(vendorId, id);
    if (c.status !== VendorContractStatus.ACTIVE) throw new BadRequestException('Only active contracts can be archived.');
    await this.prisma.vendorContract.update({ where: { id }, data: { status: VendorContractStatus.ARCHIVED } });
    return { success: true };
  }

  async ownedContract(vendorId: string, id: string) {
    const c = await this.prisma.vendorContract.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Contract not found');
    if (c.vendor_id !== vendorId) throw new ForbiddenException('Access denied');
    return c;
  }

  async fileLink(vendorId: string, id: string) {
    const c = await this.ownedContract(vendorId, id);
    if (!c.file_key) throw new BadRequestException('This contract has no uploaded file.');
    return { success: true, data: { url: this.downloadUrl(c.file_key, vendorId, c.id, c.file_name || 'contract.pdf') } };
  }

  downloadUrl(key: string, uid: string, cid: string, name: string) {
    const base = (process.env.APP_URL || '').replace(/\/+$/, '');
    return `${base}/api/contracts/files/${SignedUrl.sign({ key, uid, cid, name })}`;
  }

  /** Live preview with sample booking data. */
  async preview(vendorId: string, dto: VendorDefaultContractDto) {
    const template = await this.activeTemplate(dto.category);
    const vendor = await this.prisma.user.findUnique({
      where: { id: vendorId },
      select: { name: true, email: true, phone_number: true, vendorProfile: { select: { business_name: true, address: true } } },
    });
    const start = new Date();
    start.setDate(start.getDate() + 30);
    start.setHours(17, 0, 0, 0);
    const end = new Date(start.getTime() + 5 * 3600 * 1000);
    const data = buildMergeData({
      booking: {
        id: 'SAMPLE-BOOKING',
        scheduled_at: start,
        event_start_at: start,
        event_end_at: end,
        venue_address: '123 Sample Street, Springfield',
        guest_count: 100,
        message: 'Sample booking comments: one guest has a nut allergy.',
        amount: 1500,
        currency: 'usd',
      },
      listing: { title: 'Sample package', description: 'Description of the package the customer booked.' },
      vendor: vendor ?? {},
      customer: { name: 'Sample Customer', type: 'CUSTOMER' },
      event: { name: 'Sample Wedding' },
      fieldValues: dto.field_values,
      additionalTerms: dto.additional_terms,
      contractVersion: 1,
      timezone: 'UTC',
    });
    const missingVendor = vendorFieldsFor(dto.category)
      .filter((f) => f.required && !String(dto.field_values?.[f.key] ?? '').trim())
      .map((f) => f.label);
    return {
      success: true,
      data: { title: template.title, body: renderTemplate(template.body, data), missing_fields: missingVendor },
    };
  }

  // ─── Resolution for bookings ────────────────────────────────────────────

  /** Active contract for a listing: a listing-specific one wins over "all listings". */
  async resolveForListing(vendorId: string, listingId?: string | null): Promise<ResolvedVendorContract | null> {
    if (listingId) {
      const specific = await this.prisma.vendorContract.findFirst({
        where: {
          vendor_id: vendorId,
          status: VendorContractStatus.ACTIVE,
          applies_to_all: false,
          listings: { some: { listing_id: listingId } },
        },
        include: { template: true },
        orderBy: { version: 'desc' },
      });
      if (specific) return specific;
    }
    return this.prisma.vendorContract.findFirst({
      where: { vendor_id: vendorId, status: VendorContractStatus.ACTIVE, applies_to_all: true },
      include: { template: true },
      orderBy: { version: 'desc' },
    });
  }

  /** Body + required fields for a vendor contract (default template or uploaded addendum). */
  contractSource(vc: ResolvedVendorContract) {
    if (vc.type === VendorContractType.UPLOADED) {
      return {
        title: `Contract: ${(vc.field_values as any)?.business_legal_name ?? 'Vendor'} (with Vendly booking addendum)`,
        body: UPLOADED_ADDENDUM_BODY,
        required: UPLOADED_REQUIRED_FIELDS,
      };
    }
    if (!vc.template) throw new BadRequestException("The vendor's contract template is missing.");
    return { title: vc.template.title, body: vc.template.body, required: vc.template.required_fields };
  }

  // ─── Admin ──────────────────────────────────────────────────────────────

  async adminListTemplates() {
    const data = await this.prisma.contractTemplate.findMany({ orderBy: [{ category: 'asc' }, { version: 'desc' }] });
    return { success: true, data };
  }

  async adminCreateTemplateVersion(dto: AdminTemplateDto) {
    const last = await this.prisma.contractTemplate.findFirst({
      where: { category: dto.category },
      orderBy: { version: 'desc' },
    });
    const required =
      dto.required_fields ?? defaultTemplates().find((t) => t.category === dto.category)?.required_fields ?? [];
    const data = await this.prisma.contractTemplate.create({
      data: {
        category: dto.category,
        title: dto.title,
        body: dto.body,
        required_fields: required,
        version: (last?.version ?? 0) + 1,
        status: ContractTemplateStatus.DRAFT,
      },
    });
    return { success: true, data };
  }

  async adminActivateTemplate(id: string) {
    const t = await this.prisma.contractTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Template not found');
    await this.prisma.$transaction([
      this.prisma.contractTemplate.updateMany({
        where: { category: t.category, status: ContractTemplateStatus.ACTIVE, id: { not: id } },
        data: { status: ContractTemplateStatus.RETIRED },
      }),
      this.prisma.contractTemplate.update({ where: { id }, data: { status: ContractTemplateStatus.ACTIVE } }),
    ]);
    // Vendor contracts keep pointing at the version they chose; new vendor setups use this one.
    return { success: true };
  }

  async adminRetireTemplate(id: string) {
    const t = await this.prisma.contractTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Template not found');
    await this.prisma.contractTemplate.update({ where: { id }, data: { status: ContractTemplateStatus.RETIRED } });
    return { success: true };
  }

  async adminListVendorContracts(params: { type?: VendorContractType; status?: VendorContractStatus; page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const where: Prisma.VendorContractWhereInput = {
      ...(params.type ? { type: params.type } : {}),
      ...(params.status ? { status: params.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.vendorContract.findMany({
        where,
        include: {
          vendor: { select: { id: true, name: true, email: true } },
          template: { select: { category: true, version: true } },
          listings: { select: { listing_id: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vendorContract.count({ where }),
    ]);
    return {
      success: true,
      data: rows.map((r) => ({ ...this.present(r), vendor: r.vendor })),
      meta: { total, page, limit, last_page: Math.ceil(total / limit) },
    };
  }

  async adminFileLink(adminId: string, id: string) {
    const c = await this.prisma.vendorContract.findUnique({ where: { id } });
    if (!c?.file_key) throw new NotFoundException('No uploaded file for this contract.');
    return { success: true, data: { url: this.downloadUrl(c.file_key, adminId, c.id, c.file_name || 'contract.pdf') } };
  }
}

