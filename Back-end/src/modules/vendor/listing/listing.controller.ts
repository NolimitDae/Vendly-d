import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ListingStatus } from 'prisma/generated/client';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CreateVendorListingDto } from './dto/create-listing.dto';
import { UpdateVendorListingDto } from './dto/update-listing.dto';
import { VendorListingService } from './listing.service';

@ApiTags('vendor/listings')
@ApiBearerAuth('vendor-token')
@UseGuards(JwtAuthGuard)
@Controller('vendor/listings')
export class VendorListingController {
  constructor(private readonly service: VendorListingService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('images', 10))
  create(
    @GetUser() user: any,
    @Body() dto: CreateVendorListingDto,
    @UploadedFiles() images?: Express.Multer.File[],
  ) {
    return this.service.create(user.id, dto, images);
  }

  @Get()
  findMyListings(
    @GetUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: ListingStatus,
  ) {
    return this.service.findMyListings(user.id, { page, limit, status });
  }

  @Get(':id')
  findOne(@GetUser() user: any, @Param('id') id: string) {
    return this.service.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('images', 10))
  update(
    @GetUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateVendorListingDto,
    @UploadedFiles() images?: Express.Multer.File[],
  ) {
    return this.service.update(id, user.id, dto, images);
  }

  @Patch(':id/publish')
  publish(@GetUser() user: any, @Param('id') id: string) {
    return this.service.publishListing(id, user.id);
  }

  @Delete(':id')
  remove(@GetUser() user: any, @Param('id') id: string) {
    return this.service.remove(id, user.id);
  }
}
