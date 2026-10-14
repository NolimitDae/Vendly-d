import { Body, Controller, Delete, Get, Param, Patch, Post, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiConsumes, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import type { Response } from 'express';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { EventToolsService } from './event-tools.service';

export class TimelineItemDto {
  @ApiProperty() @IsDateString() starts_at: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() ends_at?: string | null;
  @ApiProperty() @IsString() @MaxLength(255) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) location?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() vendor_id?: string | null;
}

export class UpdateTimelineItemDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() starts_at?: string;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() ends_at?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) title?: string;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(2000) notes?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(255) location?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() vendor_id?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() done?: boolean;
}

export class EventClientDto {
  @ApiPropertyOptional({ nullable: true, description: 'Client email; null removes access' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsEmail()
  email?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sees_budget?: boolean;
}

export class VendorTeamDto {
  @ApiProperty() @IsString() @MaxLength(120) name: string;
  @ApiProperty({ type: [String] })
  @Transform(({ value }) => (Array.isArray(value) ? value : []))
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  vendor_ids: string[];
}

export class InviteTeamDto {
  @ApiProperty() @IsString() team_id: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

@ApiTags('event tools')
@ApiBearerAuth()
@Controller()
export class EventToolsController {
  constructor(private readonly service: EventToolsService) {}

  /** Event as the planner, a booked vendor or the client sees it */
  @UseGuards(JwtAuthGuard)
  @Get('events/:id/overview')
  overview(@GetUser() user: any, @Param('id') id: string) {
    return this.service.overview(id, user.id);
  }

  /** Events the user has been added to as the planner's client */
  @UseGuards(JwtAuthGuard)
  @Get('client/events')
  shared(@GetUser() user: any) {
    return this.service.sharedWithMe(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('events/:id/client')
  setClient(@GetUser() user: any, @Param('id') id: string, @Body() dto: EventClientDto) {
    return this.service.setClient(id, user.id, dto);
  }

  // run of show
  @UseGuards(JwtAuthGuard)
  @Get('events/:id/timeline')
  timeline(@GetUser() user: any, @Param('id') id: string) {
    return this.service.timeline(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('events/:id/timeline')
  addTimeline(@GetUser() user: any, @Param('id') id: string, @Body() dto: TimelineItemDto) {
    return this.service.addTimelineItem(id, user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('events/:id/timeline/:itemId')
  updateTimeline(@GetUser() user: any, @Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: UpdateTimelineItemDto) {
    return this.service.updateTimelineItem(id, itemId, user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('events/:id/timeline/:itemId')
  deleteTimeline(@GetUser() user: any, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.service.deleteTimelineItem(id, itemId, user.id);
  }

  // shared files
  @UseGuards(JwtAuthGuard)
  @Get('events/:id/files')
  files(@GetUser() user: any, @Param('id') id: string) {
    return this.service.files(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('events/:id/files')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 20 * 1024 * 1024 } }))
  upload(@GetUser() user: any, @Param('id') id: string, @UploadedFiles() files: Express.Multer.File[]) {
    return this.service.uploadFiles(id, user.id, files);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('events/:id/files/:fileId')
  deleteFile(@GetUser() user: any, @Param('id') id: string, @Param('fileId') fileId: string) {
    return this.service.deleteFile(id, fileId, user.id);
  }

  /** Signed, expiring download link (no login header needed, so it works in a browser tab) */
  @Get('event-files/:token')
  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 60, ttl: 60_000 } })
  async download(@Param('token') token: string, @Res() res: Response) {
    const f = await this.service.resolveFile(token);
    const ascii = f.name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '') || 'download';
    const inline = /^(image\/|application\/pdf)/.test(f.type);
    res.setHeader('Content-Type', f.type);
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    res.send(f.buffer);
  }

  // budget from bookings
  @UseGuards(JwtAuthGuard)
  @Get('events/:id/budget-summary')
  budget(@GetUser() user: any, @Param('id') id: string) {
    return this.service.budgetSummary(id, user.id);
  }

  // saved vendor teams
  @UseGuards(JwtAuthGuard)
  @Get('vendor-teams')
  teams(@GetUser() user: any) {
    return this.service.teams(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('vendor-teams')
  createTeam(@GetUser() user: any, @Body() dto: VendorTeamDto) {
    return this.service.saveTeam(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('vendor-teams/:teamId')
  updateTeam(@GetUser() user: any, @Param('teamId') teamId: string, @Body() dto: VendorTeamDto) {
    return this.service.saveTeam(user.id, dto, teamId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('vendor-teams/:teamId')
  deleteTeam(@GetUser() user: any, @Param('teamId') teamId: string) {
    return this.service.deleteTeam(user.id, teamId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('events/:id/invite-team')
  inviteTeam(@GetUser() user: any, @Param('id') id: string, @Body() dto: InviteTeamDto) {
    return this.service.inviteTeam(id, user.id, dto.team_id, dto.note);
  }
}
