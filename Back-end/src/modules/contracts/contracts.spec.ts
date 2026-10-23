import { BadRequestException, ConflictException } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { ContractCategory } from 'prisma/generated/client';
import { BookingContractsService } from './booking-contracts.service';
import { withProtectionFeeWording } from './contract-templates';
import { VendorContractsService } from './vendor-contracts.service';
import {
  buildMergeData,
  contentHash,
  missingFields,
  missingFieldsMessage,
  renderTemplate,
  serviceFeeFor,
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
      service_fee: 75,
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

describe('fee wording', () => {
  it('older templates render with the current fee name', () => {
    expect(withProtectionFeeWording('- Vendly service fee: {{service_fee}}\nAll payments are made through Vendly. Any service fee is paid to Vendly.')).toBe(
      '- Vendly Protection fee: {{service_fee}}\nAll payments are made through Vendly. The Vendly Protection fee is paid to Vendly.',
    );
  });

  it('a booking for an event names the customer as the event planner, whichever role is in use', () => {
    const base = mergeFor();
    expect(base.customer_role_label).toBe('Customer');
    const forEvent = buildMergeData({
      booking: { id: 'b', amount: 100, service_fee: 5, currency: 'usd' },
      listing: { title: 'DJ' },
      vendor: { name: 'V', email: 'v@x.co', vendorProfile: { business_name: 'V', address: 'A' } },
      customer: { name: 'Pat Planner', type: 'CUSTOMER' },
      event: { id: 'e1', name: 'Gala', venue: 'Hall', guest_count: 50 },
      fieldValues: SAMPLE_VALUES,
      contractVersion: 1,
    } as any);
    expect(forEvent.customer_role_label).toBe('Event Planner');
  });
});

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
    expect(body).toContain('Vendly Protection fee: $75.00');
    expect(body).toContain('Total: $1,575.00');
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

  it('computes the customer service fee to the cent', () => {
    expect(serviceFeeFor(1500, 5)).toBe(75);
    expect(serviceFeeFor(99.99, 5)).toBe(5);
    // $3 minimum (brief): small bookings pay the minimum, larger ones the percentage, free ones nothing
    expect(serviceFeeFor(40, 5, 3)).toBe(3);
    expect(serviceFeeFor(1000, 5, 3)).toBe(50);
    expect(serviceFeeFor(60, 5, 3)).toBe(3);
    expect(serviceFeeFor(0, 5, 3)).toBe(0);
    expect(serviceFeeFor(0, 5)).toBe(0);
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
    user: { findUnique: jest.fn(({ where }: any) => Promise.resolve(where.id === 'admin' ? { type: 'ADMIN', deleted_at: null } : { type: 'CUSTOMER', deleted_at: null })) },
  };
  const service = new BookingContractsService(prisma, { downloadUrl: () => 'url' } as any, {} as any, {} as any, {} as any, {} as any);
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

  it('rejects a stale admin role claim the database no longer confirms', async () => {
    await expect(service.downloadLink('c1', { userId: 'former-admin', type: 'ADMIN' }, 'executed')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('logs admin views separately from party views', async () => {
    prisma.contractAuditEvent.create.mockClear();
    await service.getOne('c1', { userId: 'admin', type: 'ADMIN' }, meta);
    await service.getOne('c1', { userId: 'customer' }, meta);
    const actions = prisma.contractAuditEvent.create.mock.calls.map((c: any) => c[0].data.action);
    expect(actions).toEqual(['ADMIN_VIEWED', 'VIEWED']);
  });
});

describe('booking a date the vendor is not free', () => {
  const setup = (blocked: any = null, busy: any = null, working_hours: any = null) => {
    const prisma: any = {
      listingAvailability: { findFirst: jest.fn().mockResolvedValue(blocked) },
      calendarBusyBlock: { findFirst: jest.fn().mockResolvedValue(busy) },
      vendorProfile: { findUnique: jest.fn().mockResolvedValue(working_hours === undefined ? null : { working_hours }) },
    };
    const service = new BookingContractsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any);
    return { prisma, check: (dto: any) => (service as any).assertDateOpen('l1', 'v1', dto) };
  };
  const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

  it('checks the customer’s local day, not the UTC one', async () => {
    const { prisma, check } = setup();
    // 8pm on Oct 25 in Chicago is already Oct 26 in UTC
    await check({ event_start_at: new Date('2026-10-26T01:00:00Z'), timezone: 'America/Chicago' });
    const where = prisma.listingAvailability.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ listing_id: 'l1', start_date: { lte: day('2026-10-25') }, end_date: { gte: day('2026-10-25') } });
    expect(prisma.calendarBusyBlock.findFirst.mock.calls[0][0].where).toMatchObject({ user_id: 'v1' });
  });

  it('covers every day an overnight event touches', async () => {
    const { prisma, check } = setup();
    await check({ event_start_at: new Date('2026-10-25T22:00:00Z'), event_end_at: new Date('2026-10-26T03:00:00Z'), timezone: 'UTC' });
    expect(prisma.listingAvailability.findFirst.mock.calls[0][0].where).toMatchObject({ start_date: { lte: day('2026-10-26') }, end_date: { gte: day('2026-10-25') } });
  });

  it('refuses a blocked day or a day busy in the vendor’s calendar', async () => {
    await expect(setup({ id: 'b' }).check({ event_start_at: new Date('2026-10-25T15:00:00Z') })).rejects.toThrow(ConflictException);
    await expect(setup(null, { id: 'x' }).check({ scheduled_at: new Date('2026-10-25T15:00:00Z') })).rejects.toThrow(ConflictException);
  });

  it('lets an open day through, and a request with no date', async () => {
    await expect(setup().check({ event_start_at: new Date('2026-10-25T15:00:00Z'), timezone: 'Not/AZone' })).resolves.toBeUndefined();
    const { prisma, check } = setup();
    await expect(check({})).resolves.toBeUndefined();
    expect(prisma.listingAvailability.findFirst).not.toHaveBeenCalled();
  });
});

describe('booking outside the vendor’s working hours', () => {
  // Mon–Fri 9am–5pm, Saturday 10am–2pm, closed Sunday
  const hours = {
    mon: { open: '09:00', close: '17:00' }, tue: { open: '09:00', close: '17:00' }, wed: { open: '09:00', close: '17:00' },
    thu: { open: '09:00', close: '17:00' }, fri: { open: '09:00', close: '17:00' }, sat: { open: '10:00', close: '14:00' }, sun: null,
  };
  const setup = (working_hours: any = hours) => {
    const prisma: any = {
      listingAvailability: { findFirst: jest.fn().mockResolvedValue(null) },
      calendarBusyBlock: { findFirst: jest.fn().mockResolvedValue(null) },
      vendorProfile: { findUnique: jest.fn().mockResolvedValue({ working_hours }) },
    };
    const service = new BookingContractsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any);
    return { prisma, check: (dto: any) => (service as any).assertDateOpen('l1', 'v1', dto) };
  };
  const refusal = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      return (e as ConflictException).getResponse() as { message: string; error: string };
    }
    throw new Error('expected a refusal');
  };

  it('lets a request inside the hours through (customer time zone)', async () => {
    const { prisma, check } = setup();
    // Sat Oct 24 2026, 11:00–13:00 in Chicago (16:00–18:00 UTC)
    await expect(check({ event_start_at: new Date('2026-10-24T16:00:00Z'), event_end_at: new Date('2026-10-24T18:00:00Z'), timezone: 'America/Chicago' })).resolves.toBeUndefined();
    expect(prisma.vendorProfile.findUnique).toHaveBeenCalledWith({ where: { user_id: 'v1' }, select: { working_hours: true } });
  });

  it('refuses a closed day with a clear 409', async () => {
    const r = await refusal(setup().check({ event_start_at: new Date('2026-10-25T17:00:00Z'), timezone: 'America/Chicago' }));
    expect(r).toEqual({ message: "The vendor doesn't work on Sundays. Please pick another day.", error: 'OUTSIDE_WORKING_HOURS' });
  });

  it('refuses a start before opening or an end after closing', async () => {
    // Sat 9:00 in Chicago, before the 10am opening
    const early = await refusal(setup().check({ event_start_at: new Date('2026-10-24T14:00:00Z'), timezone: 'America/Chicago' }));
    expect(early.message).toBe('The vendor works 10am–2pm on Saturdays.');
    // Sat 13:00–15:00 in Chicago runs past 2pm
    const late = await refusal(setup().check({ event_start_at: new Date('2026-10-24T18:00:00Z'), event_end_at: new Date('2026-10-24T20:00:00Z'), timezone: 'America/Chicago' }));
    expect(late.message).toBe('The vendor works 10am–2pm on Saturdays.');
  });

  it('uses the customer’s day, not the UTC one (time zone edge)', async () => {
    // Fri Oct 23 2026, 4pm in Los Angeles = Sat 00:00 UTC (a UTC check would see Saturday before opening)
    await expect(setup().check({ event_start_at: new Date('2026-10-23T23:00:00Z'), event_end_at: new Date('2026-10-24T00:00:00Z'), timezone: 'America/Los_Angeles' })).resolves.toBeUndefined();
    // the same moment in UTC is Friday 11pm: outside Friday's hours
    const utc = await refusal(setup().check({ event_start_at: new Date('2026-10-23T23:00:00Z'), timezone: 'UTC' }));
    expect(utc.message).toBe('The vendor works 9am–5pm on Fridays.');
  });

  it('allows anything when no hours are set (or they are unreadable)', async () => {
    await expect(setup(null).check({ event_start_at: new Date('2026-10-25T03:00:00Z') })).resolves.toBeUndefined();
    await expect(setup({ mon: 'bad' }).check({ event_start_at: new Date('2026-10-25T03:00:00Z') })).resolves.toBeUndefined();
  });

  it('checks hours in the vendor’s own time zone when it is saved with them, naming it when it isn’t the customer’s', async () => {
    const chicago = { ...hours, timezone: 'America/Chicago' };
    // Sat Oct 24 2026 16:00 UTC: 11am in Chicago (open), 12pm in New York
    await expect(setup(chicago).check({ event_start_at: new Date('2026-10-24T16:00:00Z'), timezone: 'America/New_York' })).resolves.toBeUndefined();
    // 14:30 UTC: 9:30am in Chicago, before the 10am opening, though 10:30am for a New York customer
    const early = await refusal(setup(chicago).check({ event_start_at: new Date('2026-10-24T14:30:00Z'), timezone: 'America/New_York' }));
    expect(early.message).toBe('The vendor works 10am–2pm (Chicago time) on Saturdays.');
    // a customer can't move the check by sending another zone, or none
    const tokyo = await refusal(setup(chicago).check({ event_start_at: new Date('2026-10-24T14:30:00Z'), timezone: 'Asia/Tokyo' }));
    expect(tokyo.error).toBe('OUTSIDE_WORKING_HOURS');
    await expect(setup(chicago).check({ event_start_at: new Date('2026-10-24T16:00:00Z'), timezone: 'Not/AZone' })).resolves.toBeUndefined();
    // same zone as the customer: no zone in the words
    const same = await refusal(setup(chicago).check({ event_start_at: new Date('2026-10-24T14:30:00Z'), timezone: 'America/Chicago' }));
    expect(same.message).toBe('The vendor works 10am–2pm on Saturdays.');
  });

  it('refuses a request without a real time zone when the hours have none, rather than guessing UTC', async () => {
    for (const timezone of ['Not/AZone', undefined, '+05:00']) {
      const err = await setup().check({ event_start_at: new Date('2026-10-24T16:00:00Z'), timezone }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({ message: 'Your time zone wasn’t recognised. Please refresh and try again.' });
    }
    // no hours set: nothing to check, so no zone needed
    await expect(setup(null).check({ event_start_at: new Date('2026-10-24T16:00:00Z') })).resolves.toBeUndefined();
  });

  it('still reports a blocked date first', async () => {
    const { prisma, check } = setup();
    prisma.listingAvailability.findFirst.mockResolvedValue({ id: 'b' });
    const r = await refusal(check({ event_start_at: new Date('2026-10-25T17:00:00Z'), timezone: 'America/Chicago' }));
    expect(r.error).toBe('DATE_UNAVAILABLE');
  });
});

describe('vendor contract preview', () => {
  it('reads like a real customer booking: customer label and the Vendly Protection fee in the total', async () => {
    const template = defaultTemplates().find((t) => t.category === ContractCategory.GENERAL)!;
    const prisma: any = {
      contractTemplate: { findFirst: jest.fn().mockResolvedValue({ ...template, status: 'ACTIVE', version: 1 }) },
      user: { findUnique: jest.fn().mockResolvedValue({ name: 'David', email: 'd@x.com', vendorProfile: { business_name: 'David shots' } }) },
    };
    const service = new VendorContractsService(prisma);
    const res = await service.preview('v1', { category: ContractCategory.GENERAL, field_values: {} } as any);
    expect(res.data.body).toContain('Sample Customer ("Customer")');
    expect(res.data.body).not.toContain('Event Planner');
    expect(res.data.body).toMatch(/Vendly Protection fee: \$(?!0\.00)[\d,]+\.\d\d/);
    expect(res.data.missing_fields.length).toBeGreaterThan(0);
  });
});
