import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { Public } from '../../common/auth/decorators';
import { LatLngQuery } from '../../common/http/schemas';
import { ZonesService } from './zones.service';

class LatLngQueryDto extends createZodDto(LatLngQuery) {}

class ServiceabilityDto extends createZodDto(
  z.object({
    serviceable: z.boolean(),
    zoneId: z.string().nullable(),
    cityId: z.string().nullable(),
    cityName: z.string().nullable(),
    rainMode: z.boolean(),
  }),
) {}

@ApiTags('zones')
@Controller('serviceability')
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Public()
  @Get()
  @ZodResponse({ type: ServiceabilityDto })
  async check(@Query() q: LatLngQueryDto) {
    const zone = await this.zones.locate(q.lat, q.lng);
    return {
      serviceable: zone !== null,
      zoneId: zone?.id ?? null,
      cityId: zone?.city_id ?? null,
      cityName: zone?.city_name ?? null,
      rainMode: zone?.rain_mode ?? false,
    };
  }
}
