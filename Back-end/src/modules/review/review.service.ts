import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import appConfig from 'src/config/app.config';
import { CreateReviewDto, ReplyReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewService {
  constructor(private prisma: PrismaService) {}

  async createReview(authorId: string, dto: CreateReviewDto) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: dto.booking_id, deleted_at: null },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.customer_id !== authorId)
      throw new ForbiddenException('Only the customer can leave a review');
    if (booking.status !== BookingStatus.COMPLETED)
      throw new BadRequestException('Can only review completed bookings');

    const existing = await this.prisma.review.findUnique({
      where: { booking_id: dto.booking_id },
    });
    if (existing) throw new BadRequestException('You already reviewed this booking');

    const review = await this.prisma.review.create({
      data: {
        author_id: authorId,
        vendor_id: booking.vendor_id,
        listing_id: booking.listing_id,
        booking_id: dto.booking_id,
        rating: dto.rating,
        comment: dto.comment,
      },
      include: this.reviewIncludes(),
    });

    return { success: true, data: this.formatReview(review) };
  }

  async replyToReview(reviewId: string, vendorId: string, dto: ReplyReviewDto) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, deleted_at: null },
    });

    if (!review) throw new NotFoundException('Review not found');
    if (review.vendor_id !== vendorId)
      throw new ForbiddenException('Only the vendor can reply');
    if (review.reply)
      throw new BadRequestException('You already replied to this review');

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: { reply: dto.reply },
      include: this.reviewIncludes(),
    });

    return { success: true, data: this.formatReview(updated) };
  }

  async getListingReviews(
    listingId: string,
    query: { page?: number; limit?: number },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = { listing_id: listingId, deleted_at: null };

    const [total, reviews, agg] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: this.reviewIncludes(),
      }),
      this.prisma.review.aggregate({ where, _avg: { rating: true } }),
    ]);

    return {
      success: true,
      data: reviews.map((r) => this.formatReview(r)),
      meta: {
        total,
        page,
        limit,
        last_page: Math.ceil(total / limit),
        avg_rating: agg._avg.rating,
      },
    };
  }

  async getVendorReviews(
    vendorId: string,
    query: { page?: number; limit?: number },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = { vendor_id: vendorId, deleted_at: null };

    const [total, reviews, agg] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: this.reviewIncludes(),
      }),
      this.prisma.review.aggregate({ where, _avg: { rating: true } }),
    ]);

    return {
      success: true,
      data: reviews.map((r) => this.formatReview(r)),
      meta: {
        total,
        page,
        limit,
        last_page: Math.ceil(total / limit),
        avg_rating: agg._avg.rating,
      },
    };
  }

  private reviewIncludes() {
    return {
      author: { select: { id: true, name: true, avatar: true } },
      listing: { select: { id: true, title: true } },
    };
  }

  private formatReview(review: any) {
    const avatarUrl = (avatar: string | null) =>
      avatar
        ? TanvirStorage.url(`${appConfig().storageUrl.avatar}/${avatar}`)
        : null;
    return {
      ...review,
      author: review.author
        ? { ...review.author, avatar_url: avatarUrl(review.author.avatar) }
        : null,
    };
  }
}
