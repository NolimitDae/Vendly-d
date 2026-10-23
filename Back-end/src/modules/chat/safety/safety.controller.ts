import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { Role } from 'src/common/guard/role/role.enum';
import { ChatSafetyService } from './safety.service';
import { ReportUserDto, ResolveReportDto } from './safety.dto';

/** Block / unblock / report from a chat. */
@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatSafetyController {
  constructor(private readonly service: ChatSafetyService) {}

  @Get('blocks')
  @ApiOperation({ summary: 'People I have blocked' })
  blocks(@GetUser() user: any) {
    return this.service.listBlocks(user.id);
  }

  @Post('block/:userId')
  @Throttle({ short: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Block someone: neither of you can message the other' })
  block(@GetUser() user: any, @Param('userId') userId: string) {
    return this.service.block(user.id, userId);
  }

  @Delete('block/:userId')
  @Throttle({ short: { limit: 20, ttl: 60_000 } })
  unblock(@GetUser() user: any, @Param('userId') userId: string) {
    return this.service.unblock(user.id, userId);
  }

  @Post('report')
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Report a person (optionally a conversation or one message) to Vendly' })
  report(@GetUser() user: any, @Body() dto: ReportUserDto) {
    return this.service.report(user.id, dto);
  }
}

/** Admin queue of chat reports. Suspending a user uses the existing PATCH /admin/users/:id/status. */
@ApiTags('admin/chat-reports')
@ApiBearerAuth('admin-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/chat-reports')
export class AdminChatReportsController {
  constructor(private readonly service: ChatSafetyService) {}

  @Get()
  list(@Query('status') status?: string, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.service.adminList({ status, page, limit });
  }

  @Post(':id/resolve')
  resolve(@GetUser() user: any, @Param('id') id: string, @Body() dto: ResolveReportDto) {
    return this.service.resolve(user.id, id, dto);
  }
}
