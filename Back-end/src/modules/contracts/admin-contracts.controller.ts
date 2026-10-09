import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { VendorContractStatus, VendorContractType } from 'prisma/generated/client';
import { Role } from 'src/common/guard/role/role.enum';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser, BookingContractsService } from './booking-contracts.service';
import { VendorContractsService } from './vendor-contracts.service';
import { AdminDisableContractDto, AdminTemplateDto } from './dto/contracts.dto';
import { requestMeta } from './request-meta';

@ApiTags('admin contracts')
@ApiBearerAuth('admin-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/contracts')
export class AdminContractsController {
  constructor(
    private readonly contracts: BookingContractsService,
    private readonly vendorContracts: VendorContractsService,
  ) {}

  @Get('templates')
  templates() {
    return this.vendorContracts.adminListTemplates();
  }

  @Post('templates')
  createTemplate(@Body() dto: AdminTemplateDto) {
    return this.vendorContracts.adminCreateTemplateVersion(dto);
  }

  @Patch('templates/:id/activate')
  activate(@Param('id') id: string) {
    return this.vendorContracts.adminActivateTemplate(id);
  }

  @Patch('templates/:id/retire')
  retire(@Param('id') id: string) {
    return this.vendorContracts.adminRetireTemplate(id);
  }

  @Get('vendor-contracts')
  vendorContractsList(
    @Query('type') type?: VendorContractType,
    @Query('status') status?: VendorContractStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.vendorContracts.adminListVendorContracts({ type, status, page, limit });
  }

  @Get('vendor-contracts/:id/file')
  vendorContractFile(@GetUser() user: AuthUser, @Param('id') id: string) {
    return this.vendorContracts.adminFileLink(user.userId, id);
  }

  @Post('vendor-contracts/:id/disable')
  disable(@GetUser() user: AuthUser, @Param('id') id: string, @Body() dto: AdminDisableContractDto, @Req() req: Request) {
    return this.contracts.adminDisableVendorContract(id, user.userId, dto.reason, requestMeta(req));
  }

  @Get('bookings/:bookingId')
  bookingContracts(@GetUser() user: AuthUser, @Param('bookingId') bookingId: string, @Req() req: Request) {
    return this.contracts.adminBookingContracts(bookingId, user.userId, requestMeta(req));
  }
}
