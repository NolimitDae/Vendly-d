import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SetImportUrlDto {
  @ApiProperty({ example: 'https://calendar.google.com/calendar/ical/…/basic.ics', description: 'Secret / public iCal address (https or webcal)' })
  @IsString()
  @MinLength(10)
  @MaxLength(2048)
  url: string;
}
