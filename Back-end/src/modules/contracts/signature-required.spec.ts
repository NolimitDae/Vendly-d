import { createHmac } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { BookingContractsService, DRAW_SIGNATURE_MESSAGE } from './booking-contracts.service';
import { decodeSignatureImage } from './contract-pdf';
import { PrivateStorage } from './private-storage';

jest.mock('./private-storage', () => ({
  ...jest.requireActual('./private-storage'),
  PrivateStorage: { newKey: () => 'signatures/new.png', put: jest.fn(), get: jest.fn(), remove: jest.fn() },
}));

const SHA = 'a'.repeat(64);
// 1x1 transparent PNG
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAiElEQVR42u2XWwrAMAgEc/9L2xOEYh67G5iBfFbHVMSMAQAAAHCfmhy3k61w9yVIclfjuLpRVrxVxpGvk0QlFVm8Ui62eIXgNHaFtdjpTviNdypZvRor/a9JvHaS3Rxe0nmyUkjq5F726nyoXGCkO0X69ibxSt/fJV7JLziZV+IbPtkLAADgJT6abb9BSgfpowAAAABJRU5ErkJggg==';
const PNG = `data:image/png;base64,${PNG_B64}`;
const typedOnly = { legal_name: 'Cara Customer', consent: true, content_sha256: SHA } as any;
const drawn = { ...typedOnly, signature_image: PNG } as any;

function service(prisma: any = {}) {
  const tx = {
    bookingContract: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    contractSignature: { create: jest.fn() },
    contractAuditEvent: { create: jest.fn() },
    booking: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const db: any = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'u', email: 'cara@example.com', type: 'CUSTOMER' }) },
    eventBooking: { findFirst: jest.fn().mockResolvedValue(null) },
    vendorProfile: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(tx)),
    ...prisma,
  };
  const s = new BookingContractsService(db, {} as any, { sendBookingNotification: jest.fn().mockResolvedValue(undefined) } as any, { sendToUser: jest.fn() } as any, {} as any, {} as any);
  return { s, db, tx };
}

const refusesUndrawn = async (p: Promise<unknown>) => {
  await expect(p).rejects.toBeInstanceOf(BadRequestException);
  await expect(p).rejects.toThrow(DRAW_SIGNATURE_MESSAGE);
};

beforeEach(() => jest.clearAllMocks());

describe('a drawn signature is required to sign', () => {
  it('booking request: the customer must draw', async () => {
    process.env.JWT_SECRET ||= 'test-secret';
    const payload = Buffer.from(JSON.stringify({ bid: 'b1', lid: 'l1', uid: 'cust', exp: Date.now() + 60_000, p: 'contract-preview' })).toString('base64url');
    const token = `${payload}.${createHmac('sha256', process.env.JWT_SECRET!).update(payload).digest('base64url')}`;
    const { s } = service({ booking: { findUnique: jest.fn().mockResolvedValue(null) } });
    jest.spyOn(s as any, 'prepareForBooking').mockResolvedValue({ missing: [], rendered: { content_sha256: SHA } });
    const dto = { listing_id: 'l1', preview_token: token } as any;

    await refusesUndrawn(s.createSignedBooking('cust', { ...dto, signature: typedOnly }, {}));
    await expect(s.createSignedBooking('cust', { ...dto, signature: { ...typedOnly, signature_image: 'data:image/png;base64,' + Buffer.from('not a png').toString('base64') } }, {})).rejects.toThrow('must be a PNG');
    // a customer has no saved signature to fall back on
    await refusesUndrawn(s.createSignedBooking('cust', { ...dto, signature: { ...typedOnly, use_saved_signature: true } }, {}));
    expect(PrivateStorage.put).not.toHaveBeenCalled();
  });

  it("planner's client co-signature: the client must draw", async () => {
    const contract = { id: 'c1', booking_id: 'b1', status: 'AWAITING_CLIENT', client_email: 'cara@example.com', content_sha256: SHA, booking: { vendor_id: 'v', customer_id: 'p' } };
    const { s, tx } = service({ bookingContract: { findUnique: jest.fn().mockResolvedValue(contract), findFirst: jest.fn().mockResolvedValue(null) } });
    await refusesUndrawn(s.signAsParty('c1', { userId: 'cara' }, typedOnly, {}));
    expect(tx.contractSignature.create).not.toHaveBeenCalled();
    await expect(s.signAsParty('c1', { userId: 'cara' }, drawn, {})).resolves.toMatchObject({ success: true });
    expect(tx.contractSignature.create).toHaveBeenCalledWith({ data: expect.objectContaining({ signature_image_key: 'signatures/new.png' }) });
  });

  describe('vendor Accept & Sign', () => {
    const setup = (saved: string | null) => {
      const { s, db } = service({
        bookingContract: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', status: 'AWAITING_VENDOR', supersedes_id: null, content_sha256: SHA }]) },
      });
      db.vendorProfile.findUnique.mockResolvedValue({ saved_signature_key: saved });
      const execute = jest.spyOn(s as any, 'execute').mockResolvedValue({ id: 'c1' });
      return { s, db, execute };
    };

    it('refuses a typed name alone', async () => {
      const { s, execute } = setup(null);
      await refusesUndrawn(s.countersignForBooking('b1', 'v', typedOnly, {}, async () => null));
      expect(execute).not.toHaveBeenCalled();
    });

    it('accepts the saved signature instead of drawing, when there is one', async () => {
      const { s, execute } = setup('signatures/saved.png');
      await s.countersignForBooking('b1', 'v', { ...typedOnly, use_saved_signature: true }, {}, async () => null);
      expect(execute).toHaveBeenCalledWith('c1', 'v', 'VENDOR', expect.anything(), 'signatures/saved.png', {}, expect.any(Function));

      const none = setup(null);
      await expect(none.s.countersignForBooking('b1', 'v', { ...typedOnly, use_saved_signature: true }, {}, async () => null)).rejects.toThrow('no saved signature');
    });

    it('stores a drawn one, and saves it when asked', async () => {
      const { s, db, execute } = setup(null);
      await s.countersignForBooking('b1', 'v', { ...drawn, save_signature: true }, {}, async () => null);
      expect(execute).toHaveBeenCalledWith('c1', 'v', 'VENDOR', expect.anything(), 'signatures/new.png', {}, expect.any(Function));
      expect(db.vendorProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { saved_signature_key: 'signatures/new.png' } }));
    });
  });

  it('amendments: proposing and signing both need a drawn signature (or the vendor’s saved one)', async () => {
    const { s, db } = service();
    jest.spyOn(s as any, 'amendmentContext').mockResolvedValue({ missing: [], content: SHA, role: 'CUSTOMER', full: { customer: { type: 'CUSTOMER' } } });
    await refusesUndrawn(s.requestAmendment('b1', { userId: 'cust' }, { changes: {}, signature: typedOnly } as any, {}));

    const pending = { id: 'c2', booking_id: 'b1', supersedes_id: 'c1', status: 'AWAITING_CUSTOMER', content_sha256: SHA, booking: { customer_id: 'cust' }, merge_data: {} };
    jest.spyOn(s as any, 'contractForUser').mockResolvedValue({ contract: pending, role: 'CUSTOMER' });
    const execute = jest.spyOn(s as any, 'execute').mockResolvedValue({ id: 'c2' });
    await refusesUndrawn(s.signAmendment('c2', { userId: 'cust' }, typedOnly, {}));
    expect(execute).not.toHaveBeenCalled();

    // the vendor's side may use the saved signature
    jest.spyOn(s as any, 'contractForUser').mockResolvedValue({ contract: { ...pending, status: 'AWAITING_VENDOR' }, role: 'VENDOR' });
    db.vendorProfile.findUnique.mockResolvedValue({ saved_signature_key: 'signatures/saved.png' });
    jest.spyOn(s as any, 'summary').mockReturnValue({});
    await s.signAmendment('c2', { userId: 'v' }, { ...typedOnly, use_saved_signature: true }, {});
    expect(execute).toHaveBeenCalledWith('c2', 'v', 'VENDOR', expect.anything(), 'signatures/saved.png', {}, expect.any(Function));
  });
});

describe('signature image check', () => {
  it('accepts a whole PNG, as a data URL or bare base64', () => {
    expect(decodeSignatureImage(PNG)?.length).toBeGreaterThan(57);
    expect(decodeSignatureImage(PNG_B64)).not.toBeNull();
  });

  it('refuses a cut-off PNG, a zero-size one, and other formats', () => {
    const png = Buffer.from(PNG_B64, 'base64');
    expect(() => decodeSignatureImage(png.subarray(0, png.length - 12).toString('base64'))).toThrow('PNG');
    const empty = Buffer.from(png);
    empty.writeUInt32BE(0, 16);
    expect(() => decodeSignatureImage(empty.toString('base64'))).toThrow('PNG');
    // a tiny image (e.g. a 1x1 blank) isn't a drawn signature
    const tiny = Buffer.from(png);
    tiny.writeUInt32BE(1, 16);
    tiny.writeUInt32BE(1, 20);
    expect(() => decodeSignatureImage(tiny.toString('base64'))).toThrow('PNG');
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
    expect(() => decodeSignatureImage(`data:image/jpeg;base64,${jpeg.toString('base64')}`)).toThrow('PNG');
    expect(() => decodeSignatureImage('data:image/png;base64,' + Buffer.alloc(600 * 1024).toString('base64'))).toThrow('too large');
  });
});
