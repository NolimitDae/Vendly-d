import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { CreateVendorListingDto } from './create-listing.dto';
import { MAX_LISTING_PHOTOS, readKeepImages } from '../package-details';

export class UpdateVendorListingDto extends PartialType(CreateVendorListingDto) {
  @ApiPropertyOptional({
    type: [String],
    description:
      'The existing photos to keep (their URLs or names, a JSON array in multipart forms). New photos are added after them and ' +
      'the rest are deleted. Not sent: new photos replace all the old ones.',
  })
  @IsOptional()
  // the raw value: implicit conversion would mangle a JSON string
  @Transform(({ obj, key }) => readKeepImages(obj[key]))
  @IsArray()
  @ArrayMaxSize(MAX_LISTING_PHOTOS)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  keep_images?: string[];
}
