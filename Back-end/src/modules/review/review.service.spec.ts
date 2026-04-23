import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { BookingStatus } from 'prisma/generated/client';

const mockPrisma = {
  booking: { findFirst: jest.fn() },
  review: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
};

const completedBooking = {
  id: 'booking-1',
  customer_id: 'customer-1',
  vendor_id: 'vendor-1',
  listing_id: 'listing-1',
  status: BookingStatus.COMPLETED,
  deleted_at: null,
};

describe('ReviewService', () => {
  let service: ReviewService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReviewService>(ReviewService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createReview', () => {
    it('should create a review for a completed booking', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(completedBooking);
      mockPrisma.review.findUnique.mockResolvedValue(null);
      mockPrisma.review.create.mockResolvedValue({
        id: 'review-1',
        rating: 5,
        comment: 'Great!',
        booking_id: 'booking-1',
        author: { id: 'customer-1', name: 'Customer', avatar: null },
        listing: { id: 'listing-1', title: 'Service' },
      });

      const result = await service.createReview('customer-1', {
        booking_id: 'booking-1',
        rating: 5,
        comment: 'Great!',
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.review.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException when booking not found', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(null);

      await expect(
        service.createReview('customer-1', { booking_id: 'bad', rating: 4 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-customer tries to review', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(completedBooking);

      await expect(
        service.createReview('vendor-1', { booking_id: 'booking-1', rating: 4 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when booking is not completed', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({
        ...completedBooking,
        status: BookingStatus.PENDING,
      });

      await expect(
        service.createReview('customer-1', { booking_id: 'booking-1', rating: 5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when review already exists', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(completedBooking);
      mockPrisma.review.findUnique.mockResolvedValue({ id: 'existing-review' });

      await expect(
        service.createReview('customer-1', { booking_id: 'booking-1', rating: 5 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('replyToReview', () => {
    const existingReview = {
      id: 'review-1',
      vendor_id: 'vendor-1',
      reply: null,
      deleted_at: null,
    };

    it('should allow vendor to reply', async () => {
      mockPrisma.review.findFirst.mockResolvedValue(existingReview);
      mockPrisma.review.update.mockResolvedValue({
        ...existingReview,
        reply: 'Thank you!',
        author: { id: 'c1', name: 'C', avatar: null },
        listing: null,
      });

      const result = await service.replyToReview('review-1', 'vendor-1', { reply: 'Thank you!' });
      expect(result.success).toBe(true);
    });

    it('should throw ForbiddenException for wrong vendor', async () => {
      mockPrisma.review.findFirst.mockResolvedValue(existingReview);

      await expect(
        service.replyToReview('review-1', 'wrong-vendor', { reply: 'hi' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if already replied', async () => {
      mockPrisma.review.findFirst.mockResolvedValue({ ...existingReview, reply: 'Already replied' });

      await expect(
        service.replyToReview('review-1', 'vendor-1', { reply: 'again' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
