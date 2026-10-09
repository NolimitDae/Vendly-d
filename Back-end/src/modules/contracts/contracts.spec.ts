import { ForbiddenException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { ContractCategory } from 'prisma/generated/client';
import { BookingContractsService } from './booking-contracts.service';
import {
  buildMergeData,
  contentHash,
  missingFields,
  missingFieldsMessage,
  renderTemplate,
  sha256,
} from './contract-merge';
import {
  PdfValidationError,
  buildExecutedPdf,
  decodeSignatureImage,
  validateUploadedPdf,
} from './contract-pdf';
import {
  PLATFORM_TERMS_CLAUSE,
  REQUIRED_BOOKING_FIELDS,
  UPLOADED_ADDENDUM_BODY,
  UPLOADED_REQUIRED_FIELDS,
  defaultTemplates,
  vendorFieldsFor,
} from './contract-templates';

const SAMPLE_VALUES: Record<string, string> = {
  business_legal_name: 'Vera Photo LLC',
  business_address: '1 Lens Way, Austin TX',
  cancellation_policy: 'moderate',
  governing_law: 'Texas, USA',
  overtime_rate: '150',
  travel_fee: '$1/mile',
  setup_time: '60 minutes',
  teardown_time: '30 minutes',
  delivery_time_days: '30',
  edited_images_count: '300',
  video_length: '5 minutes',
  revisions_included: '2',
  usage_rights: 'personal',
  rental_items: '10 x tables',
  security_deposit: '200',
  late_fee_per_day: '50',
  delivery_pickup_window: 'Morning of event',
  menu: 'Three courses',
  headcount_deadline: '10 days before',
  leftover_policy: 'Packed for the customer',
  service_staff_hours: '6',
  performance_length: '4 hours',
  breaks: '15 minutes per 2 hours',
  equipment_power_needs: 'Two 20A circuits',
  song_requests_policy: 'Up to 10 requests',
  capacity: '200',
  access_hours: '8am to midnight',
  outside_vendor_rules: 'Insured vendors only',
  cleanup_policy: 'Vendor cleans up',
  damage_deposit: '500',
  noise_curfew: '11pm',
  patch_test_option: 'Available on request',
  lateness_policy: 'Start time moves if late',
};

function mergeFor(overrides: Partial<Parameters<typeof buildMergeData>[0]['booking']> = {}) {
  const start = new Date('2026-12-05T22:00:00Z');
  return buildMergeData({
    booking: {
      id: 'booking-1',
      scheduled_at: start,
      event_start_at: start,
      event_end_at: new Date('2026-12-06T03:00:00Z'),
      venue_address: 'Grand Hall, Austin TX',
      guest_count: 120,
      message: 'Peanut allergy at table 4',
      amount: 1500,
      currency: 'usd',
      ...overrides,
    },
    listing: { title: 'Wedding package', description: '8 hours' },
    vendor: { name: 'Vera', email: 'vera@test.com', vendorProfile: { business_name: 'Vera Photo', address: 'Austin' } },
    customer: { name: 'Carl Customer', type: 'CUSTOMER' },
    fieldValues: SAMPLE_VALUES,
    additionalTerms: 'No flash during the ceremony.',
    contractVersion: 1,
    timezone: 'America/Chicago',
  });
}

describe('contract merge fields', () => {
  const templates = defaultTemplates();

  it('has a default template for every category', () => {
    expect(templates.map((t) => t.category).sort()).toEqual(Object.values(ContractCategory).sort());
  });

  it.each(Object.values(ContractCategory))('fills every placeholder for %s', (category) => {
    const t = templates.find((x) => x.category === category)!;
    const data = mergeFor();
    const body = renderTemplate(t.body, data);

    expect(body).not.toMatch(/\{\{/);
    expect(missingFields(t.required_fields, data)).toEqual([]);
    expect(body).toContain('Vera Photo LLC');
    expect(body).toContain('Carl Customer');
    expect(body).toContain('$1,500.00');
    expect(body).toContain(PLATFORM_TERMS_CLAUSE);
    expect(body).toContain('No flash during the ceremony.');
    expect(body).toMatch(/\[LAWYER REVIEW\]/);
    expect(body).toContain('Saturday, December 5, 2026');
    expect(body).toMatch(/4:00 PM CST/);
    for (const f of vendorFieldsFor(category).filter((f) => f.required && f.type !== 'select')) {
      expect(body).toContain(String(data[f.key]));
    }
  });

  it.each(Object.values(ContractCategory))('blocks %s when a required booking field is missing', (category) => {
    const t = templates.find((x) => x.category === category)!;
    const required = REQUIRED_BOOKING_FIELDS[category];
    const data = mergeFor({ venue_address: null, guest_count: null, event_start_at: null, event_end_at: null });
    const missing = missingFields(t.required_fields, data);
    for (const key of required.filter((k) => k !== 'event_date')) {
      expect(missing).toContain(key);
    }
  });

  it('produces a readable missing-field message', () => {
    expect(missingFieldsMessage(['venue_address', 'guest_count'])).toBe(
      "The contract can't be sent yet. Missing: venue address, guest count.",
    );
  });

  it('drops optional sections and marks empty fields', () => {
    const body = renderTemplate('A{{#client_name}} for {{client_name}}{{/client_name}}. Fee: {{travel_fee}}', {
      client_name: '',
      travel_fee: '',
    });
    expect(body).toBe('A. Fee: Not specified');
  });

  it('labels planners and names the client they act for', () => {
    const data = buildMergeData({
      booking: { id: 'b', amount: 10 },
      vendor: {},
      customer: { name: 'Pat', type: 'EVENT_PLANNER' },
      clientName: 'The Smiths',
      contractVersion: 1,
    });
    const body = renderTemplate(defaultTemplates()[0].body, data);
    expect(body).toContain('("Event Planner"), acting on behalf of The Smiths');
  });

  it('fills the uploaded-contract addendum', () => {
    const data = mergeFor();
    const body = renderTemplate(UPLOADED_ADDENDUM_BODY, data);
    expect(body).not.toMatch(/\{\{/);
    expect(missingFields(UPLOADED_REQUIRED_FIELDS, data)).toEqual([]);
    expect(body).toContain('Peanut allergy at table 4');
  });

  it('changes the content hash when the text or vendor PDF changes', () => {
    const h = contentHash('body', 'pdf-a');
    expect(contentHash('body', 'pdf-a')).toBe(h);
    expect(contentHash('body!', 'pdf-a')).not.toBe(h);
    expect(contentHash('body', 'pdf-b')).not.toBe(h);
  });
});

describe('uploaded PDF validation', () => {
  async function realPdf() {
    const doc = await PDFDocument.create();
    doc.addPage();
    return Buffer.from(await doc.save());
  }

  it('accepts a real PDF', async () => {
    await expect(validateUploadedPdf(await realPdf())).resolves.toEqual({ pageCount: 1 });
  });

  it('rejects a non-PDF even with a .pdf name', async () => {
    await expect(validateUploadedPdf(Buffer.from('PK\x03\x04 zip file'))).rejects.toThrow('not a PDF');
  });

  it('rejects encrypted PDFs', async () => {
    const pdf = Buffer.concat([await realPdf(), Buffer.from('\ntrailer << /Encrypt 9 0 R >>')]);
    await expect(validateUploadedPdf(pdf)).rejects.toThrow('Encrypted');
  });

  it('rejects files over 10 MB', async () => {
    const big = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(10 * 1024 * 1024)]);
    await expect(validateUploadedPdf(big)).rejects.toThrow('10 MB');
  });

  it('rejects empty or corrupt files', async () => {
    await expect(validateUploadedPdf(Buffer.alloc(0))).rejects.toBeInstanceOf(PdfValidationError);
    await expect(validateUploadedPdf(Buffer.from('%PDF-1.7 garbage'))).rejects.toThrow('could not be read');
  });

  it('only accepts PNG signature images', () => {
    expect(() => decodeSignatureImage('data:image/png;base64,' + Buffer.from('GIF89a').toString('base64'))).toThrow('PNG');
    expect(decodeSignatureImage(undefined)).toBeNull();
  });
});

describe('executed PDF hash', () => {
  it('detects any modification of the signed PDF', async () => {
    const pdf = Buffer.from(
      await buildExecutedPdf({
        title: 'Agreement',
        renderedBody: renderTemplate(defaultTemplates()[0].body, mergeFor()),
        certificate: {
          bookingId: 'booking-1',
          verificationCode: 'ABC123',
          contractVersion: 1,
          contentSha256: 'a'.repeat(64),
          timezone: 'America/Chicago',
          executedAt: new Date(),
          signers: [
            { role: 'CUSTOMER', legal_name: 'Carl Customer', signed_at: new Date(), document_sha256: 'a'.repeat(64) },
            { role: 'VENDOR', legal_name: 'Vera Vendor', signed_at: new Date(), document_sha256: 'a'.repeat(64) },
          ],
        },
      }),
    );
    const stored = sha256(pdf);
    const tampered = Buffer.from(pdf);
    tampered[Math.floor(tampered.length / 2)] ^= 0xff;

    expect(sha256(pdf)).toBe(stored);
    expect(sha256(tampered)).not.toBe(stored);
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThanOrEqual(3);
  });
});

describe('contract access control', () => {
  const contract = {
    id: 'c1',
    booking_id: 'b1',
    status: 'EXECUTED',
    supersedes_id: 'c0',
    executed_pdf_key: 'k',
    source_pdf_key: null,
    merge_data: {},
    signatures: [],
    booking: { id: 'b1', customer_id: 'customer', vendor_id: 'vendor', status: 'CONFIRMED', listing: null },
  };
  const prisma: any = {
    bookingContract: { findUnique: jest.fn().mockResolvedValue(contract), findMany: jest.fn().mockResolvedValue([]) },
    booking: { findFirst: jest.fn().mockResolvedValue(contract.booking) },
    eventBooking: { findFirst: jest.fn().mockResolvedValue(null) },
    event: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', name: 'E', event_planner_id: 'planner' }) },
    contractAuditEvent: { create: jest.fn() },
  };
  const service = new BookingContractsService(prisma, { downloadUrl: () => 'url' } as any, {} as any, {} as any);
  const stranger = { userId: 'stranger', type: 'CUSTOMER' };
  const meta = {};
  const sig = { legal_name: 'Sam Stranger', consent: true, content_sha256: 'a'.repeat(64) };

  it.each([
    ['list for booking', () => service.listForBooking('b1', stranger)],
    ['view', () => service.getOne('c1', stranger, meta)],
    ['download executed', () => service.downloadLink('c1', stranger, 'executed')],
    ['download draft', () => service.downloadLink('c1', stranger, 'draft')],
    ['sign', () => service.signAmendment('c1', stranger, sig as any, meta)],
    ['decline', () => service.declineAmendment('c1', stranger, meta)],
    ['preview amendment', () => service.previewAmendment('b1', stranger, { changes: { guest_count: 3 } } as any)],
    ['request amendment', () => service.requestAmendment('b1', stranger, { changes: { guest_count: 3 }, signature: sig } as any, meta)],
    ['event contracts', () => service.eventContracts('e1', stranger)],
    ['event zip', () => service.eventZipLink('e1', stranger)],
  ])('denies a non-party: %s', async (_label, fn) => {
    await expect(fn()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the vendor, the customer, a linked planner and admins', async () => {
    await expect(service.downloadLink('c1', { userId: 'vendor' }, 'executed')).resolves.toBeDefined();
    await expect(service.downloadLink('c1', { userId: 'customer' }, 'executed')).resolves.toBeDefined();
    await expect(service.downloadLink('c1', { userId: 'admin', type: 'ADMIN' }, 'executed')).resolves.toBeDefined();
    prisma.eventBooking.findFirst.mockResolvedValueOnce({ event_id: 'e1' });
    await expect(service.downloadLink('c1', { userId: 'planner' }, 'executed')).resolves.toBeDefined();
  });

  it('logs admin views separately from party views', async () => {
    prisma.contractAuditEvent.create.mockClear();
    await service.getOne('c1', { userId: 'admin', type: 'ADMIN' }, meta);
    await service.getOne('c1', { userId: 'customer' }, meta);
    const actions = prisma.contractAuditEvent.create.mock.calls.map((c: any) => c[0].data.action);
    expect(actions).toEqual(['ADMIN_VIEWED', 'VIEWED']);
  });
});
