import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { PlanChecklistDto } from './dto/checklist.dto';
import { PlanningService } from './planning.service';

@ApiTags('planning')
@Controller()
export class PlanningController {
  constructor(private readonly service: PlanningService) {}

  @ApiOperation({ summary: 'Services an event usually needs, a budget split, book-by dates and vendors available (public)' })
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('planning/checklist')
  checklist(@Body() dto: PlanChecklistDto) {
    return this.service.checklist(dto);
  }

  @ApiOperation({ summary: "The checklist for one of the planner's events, with what is already booked or budgeted" })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('events/:id/plan')
  eventPlan(@GetUser() user: any, @Param('id') id: string) {
    return this.service.eventPlan(id, user.id);
  }
}
