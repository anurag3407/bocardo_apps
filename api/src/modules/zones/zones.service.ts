import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DB, type Db, type Executor } from '../../infra/database/database';
import type { Zone } from '../../infra/database/db.types';
import type { ZonePricing } from '../pricing/pricing.calculator';

export interface LocatedZone extends Zone {
  city_name: string;
  timezone: string;
}

export const point = (lat: number, lng: number) =>
  sql`st_setsrid(st_makepoint(${lng}, ${lat}), 4326)::geography`;

/** Serviceability: which active zone (if any) covers a coordinate. */
@Injectable()
export class ZonesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async locate(
    lat: number,
    lng: number,
    executor: Executor = this.db,
  ): Promise<LocatedZone | null> {
    const row = await executor
      .selectFrom('zones as z')
      .innerJoin('cities as c', 'c.id', 'z.city_id')
      .selectAll('z')
      .select(['c.name as city_name', 'c.timezone'])
      // boundary is large and never needed by callers
      .select(sql<null>`null`.as('boundary'))
      .where('z.is_active', '=', true)
      .where('c.is_active', '=', true)
      .where(sql<boolean>`st_covers(z.boundary, ${point(lat, lng)})`)
      .limit(1)
      .executeTakeFirst();
    return row ?? null;
  }

  async findById(id: string, executor: Executor = this.db) {
    return executor.selectFrom('zones').selectAll().where('id', '=', id).executeTakeFirst();
  }
}

export const toZonePricing = (z: Zone): ZonePricing => ({
  deliveryBaseFeePaise: z.delivery_base_fee_paise,
  deliveryBaseKm: z.delivery_base_km,
  deliveryPerKmPaise: z.delivery_per_km_paise,
  platformFeePaise: z.platform_fee_paise,
  freeDeliveryAbovePaise: z.free_delivery_above_paise,
  surgeMultiplier: z.surge_multiplier,
  rainMode: z.rain_mode,
});
