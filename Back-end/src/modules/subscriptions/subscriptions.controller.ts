import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Subscriptions')
@Controller('subscription')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @ApiOperation({ summary: 'Get all available subscription plans' })
  @ApiResponse({ status: 200, description: 'List of plans' })
  @Get('plans')
  getPlans() {
    return this.subscriptionsService.getPlans();
  }

  @ApiOperation({ summary: 'Get the current vendor subscription' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('my')
  getMySubscription(@GetUser('userId') userId: string) {
    return this.subscriptionsService.getMySubscription(userId);
  }

  @ApiOperation({ summary: 'Create a checkout session for a subscription plan' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('checkout')
  checkout(
    @GetUser('userId') userId: string,
    @Body() dto: SubscribeDto,
  ) {
    return this.subscriptionsService.checkout(userId, dto);
  }

  @ApiOperation({ summary: 'Cancel the current vendor subscription' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('cancel')
  cancel(@GetUser('userId') userId: string) {
    return this.subscriptionsService.cancel(userId);
  }
}
