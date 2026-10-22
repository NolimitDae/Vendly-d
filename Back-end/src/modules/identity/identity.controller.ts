import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiConsumes, ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { IdentityVerificationStatus } from 'prisma/generated/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guard/role/roles.guard';
import { Roles } from '../../common/guard/role/roles.decorator';
import { Role } from '../../common/guard/role/role.enum';
import { ID_DOCUMENT_TYPES, ID_MAX_BYTES, IdentityService } from './identity.service';

export class SubmitIdentityDto {
  @IsIn(ID_DOCUMENT_TYPES as unknown as string[])
  document_type: string;

  @IsString()
  @MaxLength(255)
  legal_name: string;
}

export class ReviewIdentityDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

type IdFiles = { front?: Express.Multer.File[]; back?: Express.Multer.File[]; selfie?: Express.Multer.File[] };

@ApiTags('Identity')
@Controller('identity')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Where my ID check stands (NONE, PENDING, APPROVED or REJECTED)' })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  status(@Req() req: Request) {
    return this.identity.status(req.user.userId);
  }

  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a photo ID (front, back unless passport) and a selfie for review' })
  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { limit: 3, ttl: 60_000 } })
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'front', maxCount: 1 },
        { name: 'back', maxCount: 1 },
        { name: 'selfie', maxCount: 1 },
      ],
      // the real file type is checked from its bytes in the service
      { storage: memoryStorage(), limits: { fileSize: ID_MAX_BYTES, files: 3 } },
    ),
  )
  submit(@Req() req: Request, @Body() dto: SubmitIdentityDto, @UploadedFiles() files: IdFiles = {}) {
    return this.identity.submit(req.user.userId, dto, { front: files.front?.[0], back: files.back?.[0], selfie: files.selfie?.[0] });
  }

  /** Short-lived signed links handed to admins; never cached. */
  @Get('files/:token')
  @Throttle({ short: { limit: 10, ttl: 1000 } })
  async file(@Param('token') token: string, @Res() res: Response) {
    const f = await this.identity.resolveFile(token);
    res.setHeader('Content-Type', f.type);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="${f.name}"`);
    res.send(f.buffer);
  }
}

@ApiExcludeController()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/identity')
export class AdminIdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Get()
  list(@Query('status') status?: IdentityVerificationStatus, @Query('page') page?: number, @Query('limit') limit?: number) {
    const valid = status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? status : undefined;
    return this.identity.adminList(valid, page, limit);
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: Request) {
    return this.identity.adminGet(id, req.user.userId);
  }

  @Patch(':id')
  review(@Param('id') id: string, @Body() dto: ReviewIdentityDto, @Req() req: Request) {
    return this.identity.adminReview(id, req.user.userId, dto);
  }
}
