import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import { PrismaService } from 'src/prisma/prisma.service';

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({ TanvirStorage: { url: (p: string) => `https://cdn.test/${p}` } }));
import { BookingStatus } from 'prisma/generated/client';

const mockPrisma = {
  booking: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
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

    it('trims the reply and refuses an empty one', async () => {
      mockPrisma.review.findFirst.mockResolvedValue(existingReview);
      mockPrisma.review.update.mockResolvedValue({ ...existingReview, reply: 'Thanks!', author: null, listing: null });
      await service.replyToReview('review-1', 'vendor-1', { reply: '  Thanks!  ' });
      expect(mockPrisma.review.update).toHaveBeenCalledWith(expect.objectContaining({ data: { reply: 'Thanks!' } }));
      await expect(service.replyToReview('review-1', 'vendor-1', { reply: '   ' })).rejects.toThrow('Write a reply');
    });

    it('should throw BadRequestException if already replied', async () => {
      mockPrisma.review.findFirst.mockResolvedValue({ ...existingReview, reply: 'Already replied' });

      await expect(
        service.replyToReview('review-1', 'vendor-1', { reply: 'again' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("a vendor's own reviews", () => {
    it('lists them newest first with the average, the count and how many need a reply', async () => {
      mockPrisma.review.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
      mockPrisma.review.findMany.mockResolvedValue([
        { id: 'r1', rating: 5, comment: 'Great', reply: null, created_at: new Date(), author: { id: 'c1', name: 'Amara', avatar: 'a.png' }, listing: { id: 'l1', title: 'Buffet' } },
      ]);
      mockPrisma.review.aggregate.mockResolvedValue({ _avg: { rating: 4.67 } });
      (mockPrisma.review as any).groupBy = jest.fn().mockResolvedValue([{ rating: 5, _count: { rating: 2 } }, { rating: 4, _count: { rating: 1 } }]);
      const res = await service.getMyReviewsAsVendor('vendor-1', {});
      expect(mockPrisma.review.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { vendor_id: 'vendor-1', deleted_at: null }, orderBy: { created_at: 'desc' } }));
      expect(mockPrisma.review.count).toHaveBeenCalledWith({ where: { vendor_id: 'vendor-1', deleted_at: null, reply: null } });
      expect(res.meta).toMatchObject({ total: 3, avg_rating: 4.67, unanswered: 1 });
      expect(res.data[0].author.avatar_url).toContain('a.png');
      expect(res.data[0].listing.title).toBe('Buffet');
    });
  });

  describe('review prompts', () => {
    it('lists recent finished bookings without a review, not in dispute and not dismissed', async () => {
      mockPrisma.booking.findMany.mockResolvedValue([
        { id: 'b1', completed_at: new Date(), listing: { id: 'l1', title: 'DJ set', images: ['a.jpg'] }, vendor: { id: 'v1', name: 'Sam', avatar: null, vendorProfile: { business_name: 'Sam Sounds' } } },
      ]);
      const res = await service.pendingReviews('c1');
      expect(mockPrisma.booking.findMany.mock.calls[0][0].where).toMatchObject({
        customer_id: 'c1',
        status: 'COMPLETED',
        review: null,
        review_prompt_dismissed_at: null,
        dispute_opened_at: null,
        completed_at: { gte: expect.any(Date) },
      });
      expect(res.data[0]).toMatchObject({ booking_id: 'b1', listing: { title: 'DJ set', image: expect.stringContaining('a.jpg') }, vendor: { name: 'Sam Sounds', avatar_url: null } });
    });

    it('"not now" only works on your own booking', async () => {
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });
      await service.dismissPrompt('c1', 'b1');
      expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: 'b1', customer_id: 'c1', review_prompt_dismissed_at: null }, data: { review_prompt_dismissed_at: expect.any(Date) } });

      mockPrisma.booking.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.booking.findFirst.mockResolvedValue(null);
      await expect(service.dismissPrompt('someone-else', 'b1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('dismissing twice is fine', async () => {
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.booking.findFirst.mockResolvedValue({ id: 'b1' });
      await expect(service.dismissPrompt('c1', 'b1')).resolves.toEqual({ success: true });
    });
  });
});
