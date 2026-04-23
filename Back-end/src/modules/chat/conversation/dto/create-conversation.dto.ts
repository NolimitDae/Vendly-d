import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateConversationDto {
 
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    description: 'The id of the participant',
  })
  participant_id: string;
  
}
