import { IsNumber, IsString } from "class-validator";

export class AttachmentDto {
    @IsString()
    name: string;
  
    @IsString()
    type: string;
  
    @IsNumber()
    size: number;
  
    @IsString()
    file: string;
  }