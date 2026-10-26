import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { BookingContractsService } from './booking-contracts.service';

jest.mock('./private-storage', () => ({
  ...jest.requireActual('./private-storage'),
  PrivateStorage: { newKey: () => 'signatures/k.png', put: jest.fn(), get: jest.fn(), remove: jest.fn() },
}));

const SHA = 'a'.repeat(64);
// 1x1 transparent PNG: a drawn signature is required
const sig = { legal_name: 'Cara Client', consent: true, content_sha256: SHA, signature_image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAiElEQVR42u2XWwrAMAgEc/9L2xOEYh67G5iBfFbHVMSMAQAAAHCfmhy3k61w9yVIclfjuLpRVrxVxpGvk0QlFVm8Ui62eIXgNHaFtdjpTviNdypZvRor/a9JvHaS3Rxe0nmyUkjq5F726nyoXGCkO0X69ibxSt/fJV7JLziZV+IbPtkLAADgJT6abb9BSgfpowAAAABJRU5ErkJggg==' } as any;

function setup(contract: any, users: Record<string, string>) {
  const tx = {
    bookingContract: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    contractSignature: { create: jest.fn() },
    contractAuditEvent: { create: jest.fn() },
    booking: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma: any = {
    bookingContract: {
      findUnique: jest.fn().mockResolvedValue(contract),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: { findUnique: jest.fn(({ where }: any) => Promise.resolve(users[where.id] ? { id: where.id, email: users[where.id] } : null)) },
    featureFlag: { findUnique: jest.fn() },
    eventBooking: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  const push: any = { sendToUser: jest.fn() };
  const mail: any = { sendBookingNotification: jest.fn().mockResolvedValue(undefined) };
  const service = new BookingContractsService(prisma, {} as any, mail, push, {} as any, {} as any);
  return { service, prisma, tx };
}

const awaiting = {
  id: 'c1',
  booking_id: 'b1',
  status: 'AWAITING_CLIENT',
  client_email: 'cara@example.com',
  content_sha256: SHA,
  booking: { vendor_id: 'vendor', customer_id: 'planner' },
};

describe('client co-signature', () => {
  it('is off unless an admin turns the flag on', async () => {
    const { service, prisma } = setup(awaiting, {});
    prisma.featureFlag.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ enabled: false }).mockResolvedValueOnce({ enabled: true });
    await expect(service.clientCosignOn()).resolves.toBe(false);
    await expect(service.clientCosignOn()).resolves.toBe(false);
    await expect(service.clientCosignOn()).resolves.toBe(true);
  });

  it('lets the invited client sign (email matched case-insensitively) and passes it to the vendor', async () => {
    const { service, tx } = setup(awaiting, { cara: 'Cara@Example.com' });
    await expect(service.signAsParty('c1', { userId: 'cara' }, sig, {})).resolves.toMatchObject({ success: true });
    expect(tx.bookingContract.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'AWAITING_CLIENT' },
      // the vendor's 24-hour reminder clock restarts
      data: { status: 'AWAITING_VENDOR', last_reminder_at: null },
    });
    expect(tx.contractSignature.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'CLIENT', user_id: 'cara', legal_name: 'Cara Client', document_sha256: SHA }) }),
    );
    expect(tx.contractAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'SIGNED', actor_role: 'CLIENT' }) }));
    // the vendor's 72-hour window to answer starts now
    expect(tx.booking.updateMany).toHaveBeenCalledWith({ where: { id: expect.any(String), status: 'PENDING' }, data: { request_opened_at: expect.any(Date) } });
  });

  it('refuses anyone but the invited client, including the planner and vendor', async () => {
    for (const [id, email] of [['other', 'other@example.com'], ['planner', 'cara@example.com'], ['vendor', 'cara@example.com']]) {
      const { service, tx } = setup(awaiting, { [id]: email });
      await expect(service.clientSign('c1', { userId: id }, sig, {})).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.contractSignature.create).not.toHaveBeenCalled();
    }
  });

  it('needs the contract the client actually reviewed, and only signs once', async () => {
    const { service } = setup(awaiting, { cara: 'cara@example.com' });
    await expect(service.clientSign('c1', { userId: 'cara' }, { ...sig, content_sha256: 'b'.repeat(64) }, {})).rejects.toBeInstanceOf(ConflictException);

    const raced = setup(awaiting, { cara: 'cara@example.com' });
    raced.tx.bookingContract.updateMany.mockResolvedValue({ count: 0 });
    await expect(raced.service.clientSign('c1', { userId: 'cara' }, sig, {})).rejects.toBeInstanceOf(ConflictException);

    const done = setup({ ...awaiting, status: 'AWAITING_VENDOR' }, { cara: 'cara@example.com' });
    await expect(done.service.clientSign('c1', { userId: 'cara' }, sig, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tells the vendor to wait while the client has not signed', async () => {
    const { service, prisma } = setup(awaiting, {});
    prisma.bookingContract.findMany = jest.fn().mockResolvedValue([{ ...awaiting }]);
    await expect(service.countersignForBooking('b1', 'vendor', sig, {}, async () => null)).rejects.toThrow('hasn’t co-signed');
  });

  describe('what a co-signing client may not do', () => {
    const asClient = () => {
      const amendment = { ...awaiting, status: 'AWAITING_VENDOR', supersedes_id: 'c0', booking: { id: 'b1', customer_id: 'planner', vendor_id: 'vendor', status: 'CONFIRMED', listing: null }, signatures: [] };
      const ctx = setup(amendment, { cara: 'cara@example.com' });
      // the client is matched to the booking by email
      ctx.prisma.bookingContract.findFirst.mockResolvedValue({ id: 'c1' });
      ctx.prisma.booking = { findFirst: jest.fn().mockResolvedValue(amendment.booking) };
      ctx.prisma.bookingContract.update = jest.fn();
      return ctx;
    };

    it('cannot decline or withdraw an amendment', async () => {
      const { service, prisma } = asClient();
      await expect(service.declineAmendment('c1', { userId: 'cara' }, {})).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.bookingContract.update).not.toHaveBeenCalled();
    });

    it('cannot request an amendment', async () => {
      const { service } = asClient();
      await expect(service.previewAmendment('b1', { userId: 'cara' }, { changes: { guest_count: 80 } } as any)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.requestAmendment('b1', { userId: 'cara' }, { changes: { guest_count: 80 }, signature: sig } as any, {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
