import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Public } from '../../common/auth/decorators';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard';
import {
  NearbyQueryDto,
  RestaurantDetailDto,
  RestaurantDetailQueryDto,
  RestaurantListDto,
  SearchQueryDto,
  SearchResultDto,
} from './catalog.dto';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('restaurants')
  @ZodResponse({ type: RestaurantListDto })
  nearby(@Query() q: NearbyQueryDto) {
    return this.catalog.nearby(q);
  }

  @Public()
  @Get('restaurants/:id')
  @ZodResponse({ type: RestaurantDetailDto })
  detail(@Param('id', ParseUUIDPipe) id: string, @Query() q: RestaurantDetailQueryDto) {
    return this.catalog.detail(id, q.lat, q.lng);
  }

  @Public()
  @Get('search')
  @RateLimit(60, 60)
  @ZodResponse({ type: SearchResultDto })
  search(@Query() q: SearchQueryDto) {
    return this.catalog.search(q);
  }
}
