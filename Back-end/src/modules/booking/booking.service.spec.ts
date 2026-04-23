import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BookingService } from './booking.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { BookingStatus, ListingStatus } from 'prisma/generated/client';

const mockPrisma = {
  vendorListing: {
    findFirst: jest.fn(),
  },
  booking: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

const mockMail = {
  sendOtpCodeToEmail: jest.fn().mockResolvedValue(undefined),
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
      ],
    }).compile();

    service = module.get<BookingService>(BookingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a booking successfully', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'customer-1', name: 'Customer', email: 'customer@test.com' });
      mockPrisma.booking.create.mockResolvedValue(mockBooking);

      const result = await service.create('customer-1', {
        listing_id: 'listing-1',
        vendor_id: 'vendor-1',
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.booking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customer_id: 'customer-1',
            vendor_id: 'vendor-1',
            listing_id: 'listing-1',
            status: BookingStatus.PENDING,
          }),
        }),
      );
    });

    it('should throw NotFoundException when listing not found', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(null);

      await expect(
        service.create('customer-1', { listing_id: 'bad-id', vendor_id: 'vendor-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when vendor books own listing', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);

      await expect(
        service.create('vendor-1', { listing_id: 'listing-1', vendor_id: 'vendor-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when vendor_id does not match listing', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);

      await expect(
        service.create('customer-1', { listing_id: 'listing-1', vendor_id: 'wrong-vendor' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('confirm', () => {
    it('should confirm a pending booking', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(mockBooking);
      mockPrisma.booking.update.mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
      });

      const result = await service.confirm('booking-1', 'vendor-1');
      expect(result.success).toBe(true);
      expect(mockPrisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: BookingStatus.CONFIRMED } }),
      );
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
});
