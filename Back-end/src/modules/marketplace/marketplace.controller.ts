import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchListingsDto } from './dto/search-listings.dto';
import { MarketplaceService } from './marketplace.service';

@ApiTags('marketplace')
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly service: MarketplaceService) {}

  @Get('listings')
  search(@Query() query: SearchListingsDto) {
    return this.service.searchListings(query);
  }

  @Get('listings/featured')
  featured() {
    return this.service.getFeaturedListings();
  }

  @Get('listings/:id')
  getListing(@Param('id') id: string) {
    return this.service.getListing(id);
  }

  @Get('vendors/:id')
  getVendorProfile(@Param('id') id: string) {
    return this.service.getVendorProfile(id);
  }

  @Get('categories')
  getCategories() {
    return this.service.getCategories();
  }
}
