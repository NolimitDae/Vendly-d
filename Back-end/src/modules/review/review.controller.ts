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
