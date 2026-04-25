import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto2 } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  ApiBearerAuth,
  ApiExcludeController,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../../common/guard/role/role.enum';
import { Roles } from '../../../common/guard/role/roles.decorator';
import { RolesGuard } from '../../../common/guard/role/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ApproveLicenseDto } from './dto/approve-license.dto';

@ApiExcludeController()
@ApiTags('User')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('vendors')
  async getVendors(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    return this.userService.getVendors({ page, limit, status });
  }

/*------------------------------------------------------
|                     License Management               |
-------------------------------------------------------*/

  // pending list document vendor and event planner
  @Get('pending-license')
  async getPendingLicense() {
    return this.userService.getPendingLicense();
  }

  // approve list
  @Get('approved-license')
  async getApprovedLicense() {
    return this.userService.getApprovedLicense();
  }

  // approval or reject license
  @Patch('approve-license/:userId')
  async approveLicense(
    @Body() approveLicenseDto: ApproveLicenseDto,
    @Param('userId') userId: string,
  ) {
    return this.userService.approveLicense(approveLicenseDto, userId);
  }
}
