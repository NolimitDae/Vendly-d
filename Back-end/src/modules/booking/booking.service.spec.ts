import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BookingService } from './booking.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { PushService } from 'src/modules/push/push.service';
import { BookingContractsService } from 'src/modules/contracts/booking-contracts.service';
import { BookingStatus, ListingStatus } from 'prisma/generated/client';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({
  TanvirStorage: {
    put: jest.fn().mockResolvedValue(undefined),
    url: jest.fn((p: string) => `https://cdn.test/${p}`),
  },
}));

const mockPrisma = {
  vendorListing: {
    findFirst: jest.fn(),
  },
  booking: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  bookingProof: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  bookingDeliverable: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockPush = { sendToUser: jest.fn().mockResolvedValue(undefined) };

const mockContracts = {
  createSignedBooking: jest.fn(),
  countersignForBooking: jest.fn(),
  voidPendingForBooking: jest.fn().mockResolvedValue(0),
};

const mockMail = {
  sendOtpCodeToEmail: jest.fn().mockResolvedValue(undefined),
  sendBookingNotification: jest.fn().mockResolvedValue(undefined),
};

const mockListing = {
  id: 'listing-1',
  vendor_id: 'vendor-1',
  status: ListingStatus.ACTIVE,
  deleted_at: null,
  price: 100,
  title: 'Test Service',
  vendor: { id: 'vendor-1', name: 'Vendor', email: 'vendor@test.com' },
};

const mockBooking = {
  id: 'booking-1',
  customer_id: 'customer-1',
  vendor_id: 'vendor-1',
  listing_id: 'listing-1',
  status: BookingStatus.PENDING,
  deleted_at: null,
  amount: 100,
  customer: { id: 'customer-1', name: 'Customer', email: 'customer@test.com', avatar: null },
  vendor: { id: 'vendor-1', name: 'Vendor', email: 'vendor@test.com', avatar: null },
  listing: { id: 'listing-1', title: 'Test Service', price: 100, images: [] },
  review: null,
};

describe('BookingService', () => {
  let service: BookingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMail },
        { provide: PushService, useValue: mockPush },
        { provide: BookingContractsService, useValue: mockContracts },
      ],
    }).compile();

    service = module.get<BookingService>(BookingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const signedRequest = {
      listing_id: 'listing-1',
      vendor_id: 'vendor-1',
      preview_token: 'token',
      signature: { legal_name: 'Customer', consent: true, content_sha256: 'a'.repeat(64) },
    } as any;

    it('creates the booking through the signed-contract flow and notifies the vendor', async () => {
      mockContracts.createSignedBooking.mockResolvedValue({ id: 'booking-1' });
      mockPrisma.booking.findUniqueOrThrow.mockResolvedValue(mockBooking);

      const result = await service.create('customer-1', signedRequest, { ip: '1.2.3.4' });

      expect(result.success).toBe(true);
      expect(mockContracts.createSignedBooking).toHaveBeenCalledWith('customer-1', signedRequest, { ip: '1.2.3.4' });
      expect(mockPush.sendToUser).toHaveBeenCalledWith('vendor-1', expect.objectContaining({ data: { type: 'booking', bookingId: 'booking-1' } }));
    });

    it('propagates contract validation errors (e.g. missing listing)', async () => {
      mockContracts.createSignedBooking.mockRejectedValue(new NotFoundException('Listing not found or not active'));
      await expect(service.create('customer-1', signedRequest)).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirm', () => {
    it('should confirm a pending booking', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPrisma.booking.update.mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
      });

      mockContracts.countersignForBooking.mockResolvedValue(null);

      const result = await service.confirm('booking-1', 'vendor-1');
      expect(result.success).toBe(true);
      expect(mockPrisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: BookingStatus.CONFIRMED } }),
      );
    });

    it('countersigns the contract and confirms inside the same transaction (Accept & Sign)', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      const signature = { legal_name: 'Vendor', consent: true, content_sha256: 'a'.repeat(64) } as any;
      const tx = { booking: { update: jest.fn() } };
      mockContracts.countersignForBooking.mockImplementation(async (_b, _v, _s, _m, onExecuted) => {
        await onExecuted(tx);
        return { id: 'contract-1' };
      });

      await service.confirm('booking-1', 'vendor-1', { signature });

      expect(mockContracts.countersignForBooking).toHaveBeenCalledWith('booking-1', 'vendor-1', signature, {}, expect.any(Function));
      expect(tx.booking.update).toHaveBeenCalledWith({ where: { id: 'booking-1' }, data: { status: BookingStatus.CONFIRMED } });
      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when wrong vendor tries to confirm', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);

      await expect(service.confirm('booking-1', 'wrong-vendor')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when booking is not PENDING', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
      });

      await expect(service.confirm('booking-1', 'vendor-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('should allow customer to cancel', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPrisma.booking.update.mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.CANCELLED,
      });

      const result = await service.cancel('booking-1', 'customer-1', { reason: 'Changed mind' });
      expect(result.success).toBe(true);
      expect(mockContracts.voidPendingForBooking).toHaveBeenCalledWith('booking-1', 'Booking cancelled', 'customer-1');
    });

    it('should allow vendor to cancel', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPrisma.booking.update.mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.CANCELLED,
      });

      const result = await service.cancel('booking-1', 'vendor-1', {});
      expect(result.success).toBe(true);
    });

    it('should throw ForbiddenException for unrelated user', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);

      await expect(service.cancel('booking-1', 'random-user', {})).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when booking is already completed', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.COMPLETED,
      });

      await expect(service.cancel('booking-1', 'customer-1', {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('getBooking', () => {
    it('should return booking for the customer', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);

      const result = await service.getBooking('booking-1', 'customer-1');
      expect(result.success).toBe(true);
    });

    it('should throw ForbiddenException for unrelated user', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);

      await expect(service.getBooking('booking-1', 'random-user')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('push notifications', () => {
    it('pushes the customer when a booking is confirmed', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPrisma.booking.update.mockResolvedValue({ ...mockBooking, status: BookingStatus.CONFIRMED });

      await service.confirm('booking-1', 'vendor-1');

      expect(mockPush.sendToUser).toHaveBeenCalledWith(
        'customer-1',
        expect.objectContaining({ title: 'Booking confirmed' }),
      );
    });

    it('pushes the other party on cancellation', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPrisma.booking.update.mockResolvedValue({ ...mockBooking, status: BookingStatus.CANCELLED });

      await service.cancel('booking-1', 'customer-1', {} as any);

      expect(mockPush.sendToUser).toHaveBeenCalledWith('vendor-1', expect.anything());
    });
  });

  describe('proofs', () => {
    const photo = { originalname: 'a.jpg', buffer: Buffer.from('x') } as Express.Multer.File;

    it('lets a booking participant upload proof photos', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPrisma.bookingProof.create.mockImplementation(({ data }) => Promise.resolve({ id: 'p1', ...data }));

      const res = await service.uploadProof('booking-1', 'vendor-1', [photo], 'done');

      expect(TanvirStorage.put).toHaveBeenCalledTimes(1);
      expect(res.data.photos[0]).toMatch(/^https:\/\/cdn\.test\/proofs\//);
      expect(mockPrisma.bookingProof.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ uploader_id: 'vendor-1', notes: 'done' }) }),
      );
    });

    it('rejects proof upload from an unrelated user', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      await expect(service.uploadProof('booking-1', 'stranger', [photo])).rejects.toThrow(ForbiddenException);
    });

    it('requires at least one photo', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      await expect(service.uploadProof('booking-1', 'vendor-1', [])).rejects.toThrow(BadRequestException);
    });

    it('hides proofs from unrelated users', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      await expect(service.getProofs('booking-1', 'stranger')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deliverables', () => {
    beforeEach(() => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPrisma.bookingDeliverable.create.mockImplementation(({ data }) => Promise.resolve({ id: 'd1', ...data }));
    });

    it('only allows the booking vendor to send deliverables', async () => {
      await expect(
        service.sendDeliverable('booking-1', 'customer-1', [], { title: 'x' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('accepts links as a JSON string (multipart) or an array (JSON body)', async () => {
      await service.sendDeliverable('booking-1', 'vendor-1', [], {
        title: 'Photos',
        links: JSON.stringify(['https://a.test/1']),
      });
      await service.sendDeliverable('booking-1', 'vendor-1', [], {
        title: 'Photos',
        links: ['https://a.test/2'],
      });

      const calls = mockPrisma.bookingDeliverable.create.mock.calls;
      expect(calls[0][0].data.links).toEqual(['https://a.test/1']);
      expect(calls[1][0].data.links).toEqual(['https://a.test/2']);
    });

    it('drops non-http(s) links such as javascript: URLs', async () => {
      await service.sendDeliverable('booking-1', 'vendor-1', [], {
        title: 'x',
        links: ['javascript:alert(1)', 'https://ok.test', 'ftp://nope'],
      });

      expect(mockPrisma.bookingDeliverable.create.mock.calls[0][0].data.links).toEqual(['https://ok.test']);
    });

    it('pushes the customer when a deliverable is sent', async () => {
      await service.sendDeliverable('booking-1', 'vendor-1', [], { title: 'Final files' });
      expect(mockPush.sendToUser).toHaveBeenCalledWith(
        'customer-1',
        expect.objectContaining({ title: 'New deliverable', body: 'Final files' }),
      );
    });
  });
});
