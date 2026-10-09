import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserType } from 'prisma/generated/client';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from './booking-contracts.service';
import { VendorContractsService } from './vendor-contracts.service';
import { VendorDefaultContractDto, VendorUploadContractDto } from './dto/contracts.dto';

// multer stops reading just past 10 MB; the service reports the friendly error
const UPLOAD = FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 + 1, files: 1 } });

@ApiTags('vendor contracts')
@ApiBearerAuth('vendor-token')
@UseGuards(JwtAuthGuard)
@Controller('vendor/contracts')
export class VendorContractsController {
  constructor(private readonly service: VendorContractsService) {}

  private vendorId(user: AuthUser) {
    if (user.type !== UserType.VENDOR) throw new ForbiddenException('Only vendors can manage contracts.');
    return user.userId;
  }

  @Get()
  list(@GetUser() user: AuthUser) {
    return this.service.listForVendor(this.vendorId(user));
  }

  @Post('preview')
  preview(@GetUser() user: AuthUser, @Body() dto: VendorDefaultContractDto) {
    return this.service.preview(this.vendorId(user), dto);
  }

  @Post('default')
  createDefault(@GetUser() user: AuthUser, @Body() dto: VendorDefaultContractDto) {
    return this.service.createDefault(this.vendorId(user), dto);
  }

  @Post('use-default')
  useDefault(@GetUser() user: AuthUser) {
    return this.service.useDefault(this.vendorId(user));
  }

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(UPLOAD)
  upload(@GetUser() user: AuthUser, @UploadedFile() file: Express.Multer.File, @Body() dto: VendorUploadContractDto) {
    return this.service.upload(this.vendorId(user), file, dto);
  }

  @Put(':id/default')
  replaceDefault(@GetUser() user: AuthUser, @Param('id') id: string, @Body() dto: VendorDefaultContractDto) {
    return this.service.createDefault(this.vendorId(user), dto, id);
  }

  @Put(':id/upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(UPLOAD)
  replaceUpload(
    @GetUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: VendorUploadContractDto,
  ) {
    return this.service.upload(this.vendorId(user), file, dto, id);
  }

  @Patch(':id/archive')
  archive(@GetUser() user: AuthUser, @Param('id') id: string) {
    return this.service.archive(this.vendorId(user), id);
  }

  @Get(':id/file')
  file(@GetUser() user: AuthUser, @Param('id') id: string) {
    return this.service.fileLink(this.vendorId(user), id);
  }
}
