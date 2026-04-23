import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMessageDto {
  
  @ApiProperty({
    description: 'The content of the message',
    example: 'Hello, how are you?',
  })
  @IsNotEmpty()
  @IsString()
  @IsOptional()
  text?: string;

  @ApiProperty({
    description: 'The ID of the conversation this message belongs to',
    example: 'clx123abc456def789',
  })
  @IsNotEmpty()
  @IsString()
  conversationId: string;

}
