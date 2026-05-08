import { PartialType } from '@nestjs/swagger';
import { CreateVendorListingDto } from './create-listing.dto';

export class UpdateVendorListingDto extends PartialType(CreateVendorListingDto) {}
