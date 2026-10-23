import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OnboardingService } from './onboarding.service';

export class OnboardingSeenDto {
  @IsIn(['intro', 'complete'])
  kind: 'intro' | 'complete';
}

@ApiTags('Onboarding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @ApiOperation({ summary: 'The "get set up" checklist for the role in use, and which popup to show' })
  @Get()
  get(@Req() req: Request) {
    return this.onboarding.get(req.user.userId);
  }

  @ApiOperation({ summary: 'Record that the intro or "all set" popup was shown' })
  @Post('seen')
  seen(@Req() req: Request, @Body() dto: OnboardingSeenDto) {
    return this.onboarding.markSeen(req.user.userId, dto.kind);
  }
}
