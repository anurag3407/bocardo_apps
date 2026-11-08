import { Controller, Get, Query } from '@nestjs/common';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard';
import {
  AutocompleteQueryDto,
  GeocodedPlace,
  PlaceDetailsQueryDto,
  PlacePrediction,
  ReverseGeocodeQueryDto,
} from './maps.dto';
import { MapsService } from './maps.service';

@Controller('maps')
export class MapsController {
  constructor(private readonly maps: MapsService) {}

  @RateLimit(60, 60)
  @Get('autocomplete')
  autocomplete(@Query() query: AutocompleteQueryDto): Promise<PlacePrediction[]> {
    return this.maps.autocomplete(query);
  }

  @RateLimit(20, 60)
  @Get('place-details')
  placeDetails(@Query() query: PlaceDetailsQueryDto): Promise<GeocodedPlace | null> {
    return this.maps.placeDetails(query);
  }

  @RateLimit(30, 60)
  @Get('reverse-geocode')
  reverseGeocode(@Query() query: ReverseGeocodeQueryDto): Promise<GeocodedPlace | null> {
    return this.maps.reverseGeocode(query);
  }
}
