import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { ChatExtrasService } from './chat-extras.service';

export class CreateQuoteDto {
  @ApiProperty() @IsString() listing_id: string;
  @ApiProperty() @IsString() @MaxLength(255) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(1) amount: number;
  @ApiPropertyOptional({ default: 7 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) expires_in_days?: number;
}

export class PinDto {
  @ApiPropertyOptional({ nullable: true, description: 'Message to pin; null unpins' })
  @IsOptional()
  @IsString()
  message_id?: string | null;
}

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatExtrasController {
  constructor(private readonly service: ChatExtrasService) {}

  /** Open (creating if needed) the group chat for an event */
  @Post('events/:eventId/open')
  openEventChat(@GetUser() user: any, @Param('eventId') eventId: string) {
    return this.service.openEventChat(eventId, user.id);
  }

  @Post('conversation/:id/pin')
  pin(@GetUser() user: any, @Param('id') id: string, @Body() dto: PinDto) {
    return this.service.pin(id, user.id, dto.message_id ?? null);
  }

  @Post('conversation/:id/quotes')
  createQuote(@GetUser() user: any, @Param('id') id: string, @Body() dto: CreateQuoteDto) {
    return this.service.createQuote(id, user.id, dto);
  }

  @Get('quotes/:id')
  getQuote(@GetUser() user: any, @Param('id') id: string) {
    return this.service.getQuote(id, user.id);
  }

  @Post('quotes/:id/decline')
  decline(@GetUser() user: any, @Param('id') id: string) {
    return this.service.declineQuote(id, user.id);
  }

  @Post('quotes/:id/withdraw')
  withdraw(@GetUser() user: any, @Param('id') id: string) {
    return this.service.withdrawQuote(id, user.id);
  }
}
