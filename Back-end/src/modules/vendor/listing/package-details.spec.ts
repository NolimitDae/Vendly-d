import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateVendorListingDto } from './dto/create-listing.dto';
import { UpdateVendorListingDto } from './dto/update-listing.dto';
import { keptImageNames, noticeLabel, readIncludedItems, tooSoonMessage } from './package-details';

// the same options as the app's global ValidationPipe
const parse = async (cls: any, body: Record<string, unknown>) => {
  const dto = plainToInstance(cls, body, { enableImplicitConversion: true }) as any;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, messages: errors.flatMap((e) => Object.values(e.constraints ?? {})) };
};
const base = { title: 'Wedding photos', description: 'Full day', price: 500 };

describe('included items', () => {
  it('reads a JSON array from a multipart form, trims and drops empty lines', async () => {
    const { dto, messages } = await parse(CreateVendorListingDto, { ...base, included_items: JSON.stringify([' 8 hours ', '', '  ', 'Online gallery']) });
    expect(messages).toEqual([]);
    expect(dto.included_items).toEqual(['8 hours', 'Online gallery']);
  });

  it('takes a plain array or one item per line too', () => {
    expect(readIncludedItems(['a', ' b '])).toEqual(['a', 'b']);
    expect(readIncludedItems('Drone shots\n\nSecond shooter')).toEqual(['Drone shots', 'Second shooter']);
    expect(readIncludedItems(undefined)).toBeUndefined();
  });

  it('an empty list clears them on edit; leaving the field out keeps them', async () => {
    expect((await parse(UpdateVendorListingDto, { included_items: '[]' })).dto.included_items).toEqual([]);
    expect((await parse(UpdateVendorListingDto, { title: 'x' })).dto.included_items).toBeUndefined();
  });

  it('allows up to 20 items of up to 120 characters', async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `Item ${i}`);
    expect((await parse(CreateVendorListingDto, { ...base, included_items: twenty })).messages).toEqual([]);
    expect((await parse(CreateVendorListingDto, { ...base, included_items: [...twenty, 'one more'] })).messages).toContain('Add up to 20 included items.');
    expect((await parse(CreateVendorListingDto, { ...base, included_items: ['x'.repeat(121)] })).messages).toContain(
      'Each included item can be up to 120 characters.',
    );
  });
});

describe('minimum notice', () => {
  it('accepts 0 to 2160 hours and an empty field (clears it)', async () => {
    expect((await parse(CreateVendorListingDto, { ...base, min_notice_hours: '48' })).dto.min_notice_hours).toBe(48);
    expect((await parse(UpdateVendorListingDto, { min_notice_hours: '' })).dto.min_notice_hours).toBeNull();
    expect((await parse(CreateVendorListingDto, { ...base, min_notice_hours: 2160 })).messages).toEqual([]);
    expect((await parse(CreateVendorListingDto, { ...base, min_notice_hours: 2161 })).messages).toContain('Minimum notice can be up to 90 days.');
    expect((await parse(CreateVendorListingDto, { ...base, min_notice_hours: -1 })).messages.length).toBeGreaterThan(0);
    expect((await parse(CreateVendorListingDto, { ...base, min_notice_hours: '1.5' })).messages.length).toBeGreaterThan(0);
  });

  it('says days for whole days, hours otherwise', () => {
    expect(noticeLabel(24)).toBe('1 day');
    expect(noticeLabel(72)).toBe('3 days');
    expect(noticeLabel(36)).toBe('36 hours');
    expect(noticeLabel(1)).toBe('1 hour');
  });

  it('refuses an event that starts too soon, with a clear message', () => {
    const now = new Date('2026-10-24T12:00:00Z');
    expect(tooSoonMessage(72, new Date('2026-10-26T12:00:00Z'), now)).toBe(
      'This package needs to be booked at least 3 days ahead. Please pick a later date.',
    );
    expect(tooSoonMessage(72, new Date('2026-10-27T12:00:00Z'), now)).toBeNull();
    expect(tooSoonMessage(12, '2026-10-24T20:00:00Z', now)).toContain('at least 12 hours ahead');
  });

  it('lets anything through without a notice or without a date', () => {
    const now = new Date('2026-10-24T12:00:00Z');
    expect(tooSoonMessage(null, new Date('2026-10-24T13:00:00Z'), now)).toBeNull();
    expect(tooSoonMessage(0, new Date('2026-10-24T13:00:00Z'), now)).toBeNull();
    expect(tooSoonMessage(48, null, now)).toBeNull();
  });
});

describe('photos to keep', () => {
  it('reads keep_images from a multipart JSON string; not sent stays undefined', async () => {
    expect((await parse(UpdateVendorListingDto, { keep_images: JSON.stringify(['a.jpg', 'https://cdn.test/listings/b.jpg']) })).dto.keep_images).toEqual([
      'a.jpg',
      'https://cdn.test/listings/b.jpg',
    ]);
    expect((await parse(UpdateVendorListingDto, { keep_images: '[]' })).dto.keep_images).toEqual([]);
    expect((await parse(UpdateVendorListingDto, {})).dto.keep_images).toBeUndefined();
    expect((await parse(UpdateVendorListingDto, { keep_images: JSON.stringify([1]) })).messages.length).toBeGreaterThan(0);
  });

  it("matches URLs or names to the listing's own photos, in the order sent", () => {
    expect(keptImageNames(['a.jpg', 'b.jpg', 'c.jpg'], ['https://cdn.test/listings/c.jpg?x=1', 'a.jpg', 'a.jpg', 'zzz.jpg'])).toEqual(['c.jpg', 'a.jpg']);
    expect(keptImageNames(['a.jpg'], [])).toEqual([]);
  });
});
