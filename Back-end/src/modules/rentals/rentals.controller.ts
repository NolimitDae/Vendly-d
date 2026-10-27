import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CreateRentalItemDto, RentalBookDto, RentalDeliveryFeeDto, RentalQuoteDto, RentalReturnDto, UpdateRentalItemDto } from './dto/rentals.dto';
import { RentalsService } from './rentals.service';

@ApiTags('vendor/rentals')
@ApiBearerAuth('vendor-token')
@UseGuards(JwtAuthGuard)
@Controller('vendor/rentals')
export class VendorRentalsController {
  constructor(private readonly service: RentalsService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('images', 10))
  create(@GetUser() user: any, @Body() dto: CreateRentalItemDto, @UploadedFiles() images?: Express.Multer.File[]) {
    return this.service.createItem(user.id, dto, images);
  }

  @Get()
  mine(@GetUser() user: any) {
    return this.service.myItems(user.id);
  }

  // before ':id' so it isn't read as an item id
  @Get('delivery-fee')
  deliveryFee(@GetUser() user: any) {
    return this.service.deliveryFee(user.id);
  }

  @Patch('delivery-fee')
  updateDeliveryFee(@GetUser() user: any, @Body() dto: RentalDeliveryFeeDto) {
    return this.service.updateDeliveryFee(user.id, dto);
  }

  @Get(':id')
  one(@GetUser() user: any, @Param('id') id: string, @Query('from') from?: string) {
    return this.service.myItem(id, user.id, from);
  }

  @Patch(':id')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('images', 10))
  update(@GetUser() user: any, @Param('id') id: string, @Body() dto: UpdateRentalItemDto, @UploadedFiles() images?: Express.Multer.File[]) {
    return this.service.updateItem(id, user.id, dto, images);
  }

  @Delete(':id')
  remove(@GetUser() user: any, @Param('id') id: string) {
    return this.service.removeItem(id, user.id);
  }
}

@ApiTags('rentals')
@Controller('rentals')
export class RentalsController {
  constructor(private readonly service: RentalsService) {}

  @Get()
  browse(
    @Query('search') search?: string,
    @Query('category_id') category_id?: string,
    @Query('vendor_id') vendor_id?: string,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.browse({ search, category_id, vendor_id, start_date, end_date, page, limit });
  }

  @Post('quote')
  quote(@Body() dto: RentalQuoteDto) {
    return this.service.quote(dto);
  }

  @Post('book')
  @ApiBearerAuth('user-token')
  @UseGuards(JwtAuthGuard)
  book(@GetUser() user: any, @Body() dto: RentalBookDto) {
    return this.service.book(user.id, dto);
  }

  /** Vendor checks the items back in, with optional photos and damage / late fees */
  @Post('bookings/:bookingId/return')
  @ApiBearerAuth('vendor-token')
  @UseGuards(JwtAuthGuard)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('photos', 10))
  recordReturn(@GetUser() user: any, @Param('bookingId') bookingId: string, @Body() dto: RentalReturnDto, @UploadedFiles() photos?: Express.Multer.File[]) {
    return this.service.recordReturn(bookingId, user.id, dto, photos);
  }

  @Get(':id')
  item(@Param('id') id: string, @Query('from') from?: string) {
    return this.service.getItem(id, from);
  }
}
