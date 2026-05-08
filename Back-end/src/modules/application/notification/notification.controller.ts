import { Controller, Get, Post, Delete, Param, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { Request } from 'express';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  getMyNotifications(@Req() req: Request) {
    return this.notificationService.findAllForUser(req.user.userId);
  }

  @Post(':id/read')
  markRead(@Req() req: Request, @Param('id') id: string) {
    return this.notificationService.markRead(id, req.user.userId);
  }

  @Post('read-all')
  markAllRead(@Req() req: Request) {
    return this.notificationService.markAllRead(req.user.userId);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.notificationService.remove(id, req.user.userId);
  }
}
