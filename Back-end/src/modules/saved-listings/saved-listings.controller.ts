import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SavedListingsService } from './saved-listings.service';

@ApiTags('saved-listings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('saved-listings')
export class SavedListingsController {
  constructor(private readonly service: SavedListingsService) {}

  /** All saved listings for the current user (with full listing data) */
  @Get()
  findAll(@GetUser() user: any) {
    return this.service.findAll(user.userId);
  }

  /** Just the listing IDs — used client-side to pre-fill heart states */
  @Get('ids')
  getSavedIds(@GetUser() user: any) {
    return this.service.getSavedIds(user.userId);
  }

  /** Save (favourite) a listing */
  @Post(':listingId')
  save(@GetUser() user: any, @Param('listingId') listingId: string) {
    return this.service.save(user.userId, listingId);
  }

  /** Remove a listing from favourites */
  @Delete(':listingId')
  remove(@GetUser() user: any, @Param('listingId') listingId: string) {
    return this.service.remove(user.userId, listingId);
  }
}
