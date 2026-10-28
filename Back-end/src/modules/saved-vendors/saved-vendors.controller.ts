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
import { SavedVendorsService } from './saved-vendors.service';

@ApiTags('saved-vendors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('saved-vendors')
export class SavedVendorsController {
  constructor(private readonly service: SavedVendorsService) {}

  /** The current user's saved vendors that are still on the marketplace (shop card data) */
  @Get()
  findAll(@GetUser() user: any) {
    return this.service.findAll(user.userId);
  }

  /** Just the vendor IDs — used client-side to pre-fill heart states */
  @Get('ids')
  getSavedIds(@GetUser() user: any) {
    return this.service.getSavedIds(user.userId);
  }

  /** Save (favourite) a vendor */
  @Post(':vendorId')
  save(@GetUser() user: any, @Param('vendorId') vendorId: string) {
    return this.service.save(user.userId, vendorId);
  }

  /** Remove a vendor from favourites */
  @Delete(':vendorId')
  remove(@GetUser() user: any, @Param('vendorId') vendorId: string) {
    return this.service.remove(user.userId, vendorId);
  }
}
