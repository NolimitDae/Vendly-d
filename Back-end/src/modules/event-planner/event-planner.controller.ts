import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ADMIN_APPROVE_STATUS } from 'prisma/generated/client';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { Role } from 'src/common/guard/role/role.enum';
import { CreateEventPlannerProfileDto } from './dto/create-profile.dto';
import { EventPlannerService } from './event-planner.service';

@ApiTags('event-planner')
@Controller('event-planner')
export class EventPlannerController {
  constructor(private readonly service: EventPlannerService) {}

  // Public
  @Get('planners')
  listPlanners(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('event_type') event_type?: string,
  ) {
    return this.service.listApprovedPlanners({ page, limit, event_type });
  }

  @Get('planners/:userId')
  getPublicProfile(@Param('userId') userId: string) {
    return this.service.getPublicProfile(userId);
  }

  // Authenticated — event planner manages their own profile
  @Post('profile')
  @ApiBearerAuth('vendor-token')
  @UseGuards(JwtAuthGuard)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'portfolio', maxCount: 20 },
      { name: 'license', maxCount: 5 },
    ]),
  )
  upsertProfile(
    @GetUser() user: any,
    @Body() dto: CreateEventPlannerProfileDto,
    @UploadedFiles()
    files?: { portfolio?: Express.Multer.File[]; license?: Express.Multer.File[] },
  ) {
    return this.service.upsertProfile(
      user.id,
      dto,
      files?.portfolio,
      files?.license,
    );
  }

  @Get('profile/me')
  @ApiBearerAuth('vendor-token')
  @UseGuards(JwtAuthGuard)
  getMyProfile(@GetUser() user: any) {
    return this.service.getMyProfile(user.id);
  }

  // Admin
  @Get('admin/pending')
  @ApiBearerAuth('admin-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getPending(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.service.getPendingPlanners({ page, limit });
  }

  @Patch('admin/:userId/status')
  @ApiBearerAuth('admin-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateStatus(
    @Param('userId') userId: string,
    @Body('status') status: ADMIN_APPROVE_STATUS,
  ) {
    return this.service.updateApprovalStatus(userId, status);
  }
}
