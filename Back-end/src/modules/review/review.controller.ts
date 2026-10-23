import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CreateReviewDto, ReplyReviewDto } from './dto/create-review.dto';
import { ReviewService } from './review.service';

@ApiTags('reviews')
@Controller('reviews')
export class ReviewController {
  constructor(private readonly service: ReviewService) {}

  @Post()
  @ApiBearerAuth('customer-token')
  @UseGuards(JwtAuthGuard)
  create(@GetUser() user: any, @Body() dto: CreateReviewDto) {
    return this.service.createReview(user.id, dto);
  }

  /** Finished bookings the signed-in customer hasn't rated yet, newest first, for the "how was it?" prompt. */
  @Get('pending')
  @ApiBearerAuth('customer-token')
  @UseGuards(JwtAuthGuard)
  pending(@GetUser() user: any) {
    return this.service.pendingReviews(user.id);
  }

  /** "Not now": stops asking about this booking (it can still be rated from the booking). */
  @Post('pending/:bookingId/dismiss')
  @ApiBearerAuth('customer-token')
  @UseGuards(JwtAuthGuard)
  dismiss(@GetUser() user: any, @Param('bookingId') bookingId: string) {
    return this.service.dismissPrompt(user.id, bookingId);
  }

  @Patch(':id/reply')
  @ApiBearerAuth('vendor-token')
  @UseGuards(JwtAuthGuard)
  reply(
    @GetUser() user: any,
    @Param('id') id: string,
    @Body() dto: ReplyReviewDto,
  ) {
    return this.service.replyToReview(id, user.id, dto);
  }

  /** The signed-in vendor's own reviews with their average, count and how many still need a reply. */
  @Get('my')
  @ApiBearerAuth('vendor-token')
  @UseGuards(JwtAuthGuard)
  mine(@GetUser() user: any, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.service.getMyReviewsAsVendor(user.id, { page, limit });
  }

  @Get('listing/:listingId')
  getListingReviews(
    @Param('listingId') listingId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getListingReviews(listingId, { page, limit });
  }

  @Get('vendor/:vendorId')
  getVendorReviews(
    @Param('vendorId') vendorId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getVendorReviews(vendorId, { page, limit });
  }
}
