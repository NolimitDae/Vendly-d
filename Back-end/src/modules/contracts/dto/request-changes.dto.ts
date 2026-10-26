import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDate, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { OptionChoiceDto } from 'src/modules/add-ons/dto/package-options.dto';
import { MAX_OPTION_GROUPS } from 'src/modules/add-ons/package-options';
import { MAX_LINE_PRICE, MAX_LINE_QUANTITY, MAX_LINES, MAX_NOTE } from '../request-changes';
import { SignatureDto } from './contracts.dto';

/** One add-on or fee in a suggestion: a line already on the request (extra_id) or one being added (add_on_id). */
export class ProposalLineDto {
  @ApiPropertyOptional({ description: 'A line already on the request' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  extra_id?: string;

  @ApiPropertyOptional({ description: 'One of the vendor’s add-ons or fees, to add' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  add_on_id?: string;

  @ApiPropertyOptional({ description: 'Fixed and per item lines; per person and per hour lines follow the guests and hours' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LINE_QUANTITY)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Price per unit for this booking (defaults to the line’s current price)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_LINE_PRICE)
  unit_price?: number;
}

/** The vendor's suggested terms for a request. Anything left out stays as it is. */
export class ProposalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  event_start_at?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  event_end_at?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  guest_count?: number;

  @ApiPropertyOptional({ type: [ProposalLineDto], description: 'The whole new list of add-ons and fees; lines left out are removed' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => ProposalLineDto)
  lines?: ProposalLineDto[];

  @ApiPropertyOptional({ type: [OptionChoiceDto], description: 'The whole new set of customization choices' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_OPTION_GROUPS)
  @ValidateNested({ each: true })
  @Type(() => OptionChoiceDto)
  options?: OptionChoiceDto[];

  @ApiPropertyOptional({ description: 'A short note to the customer' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTE)
  note?: string;
}

export class SendProposalDto extends ProposalDto {
  @ApiProperty({ type: SignatureDto })
  @ValidateNested()
  @Type(() => SignatureDto)
  signature: SignatureDto;
}

export class ApproveProposalDto {
  @ApiProperty({ type: SignatureDto })
  @ValidateNested()
  @Type(() => SignatureDto)
  signature: SignatureDto;
}

export class DeclineProposalDto {
  @ApiPropertyOptional({ description: 'Why, shared with the vendor' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
