import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { AppError } from '../../common/errors/app-error';
import { DB, type Db } from '../../infra/database/database';
import { AuditService } from '../../platform/audit/audit.service';
import type { CreateCityDto, CreateZoneDto, UpdateZoneDto, ZoneDto } from './admin.dto';

@Injectable()
export class AdminGeoService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async cities() {
    const rows = await this.db.selectFrom('cities').selectAll().orderBy('name').execute();
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      timezone: c.timezone,
      isActive: c.is_active,
    }));
  }

  async createCity(actorId: string, input: CreateCityDto) {
    const c = await this.db
      .insertInto('cities')
      .values({ name: input.name, timezone: input.timezone })
      .returningAll()
      .executeTakeFirstOrThrow();
    await this.audit.record(this.db, {
      actorId,
      action: 'city.create',
      entityType: 'city',
      entityId: c.id,
      after: input,
    });
    return { id: c.id, name: c.name, timezone: c.timezone, isActive: c.is_active };
  }

  async zones(cityId?: string): Promise<ZoneDto[]> {
    const rows = await this.db
      .selectFrom('zones')
      .selectAll()
      .select(sql<string>`st_asgeojson(boundary)`.as('geojson'))
      .$if(!!cityId, (q) => q.where('city_id', '=', cityId!))
      .orderBy('name')
      .execute();
    return rows.map((z) => ({
      id: z.id,
      cityId: z.city_id,
      name: z.name,
      boundary: JSON.parse(z.geojson),
      isActive: z.is_active,
      deliveryBaseFeePaise: z.delivery_base_fee_paise,
      deliveryBaseKm: z.delivery_base_km,
      deliveryPerKmPaise: z.delivery_per_km_paise,
      platformFeePaise: z.platform_fee_paise,
      freeDeliveryAbovePaise: z.free_delivery_above_paise,
      surgeMultiplier: z.surge_multiplier,
      rainMode: z.rain_mode,
    }));
  }

  async createZone(actorId: string, input: CreateZoneDto) {
    const boundary = geography(input.boundary);
    await this.assertValidPolygon(input.boundary);
    const row = await this.db
      .insertInto('zones')
      .values({
        city_id: input.cityId,
        name: input.name,
        boundary,
        is_active: input.isActive,
        delivery_base_fee_paise: input.deliveryBaseFeePaise,
        delivery_base_km: input.deliveryBaseKm,
        delivery_per_km_paise: input.deliveryPerKmPaise,
        platform_fee_paise: input.platformFeePaise,
        free_delivery_above_paise: input.freeDeliveryAbovePaise,
        surge_multiplier: input.surgeMultiplier,
        rain_mode: input.rainMode,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.audit.record(this.db, {
      actorId,
      action: 'zone.create',
      entityType: 'zone',
      entityId: row.id,
      after: { ...input, boundary: undefined },
    });
    return this.zone(row.id);
  }

  /** Surge, rain mode and fees are edited here live during demand spikes. */
  async updateZone(id: string, actorId: string, input: UpdateZoneDto) {
    const before = await this.zone(id);
    if (input.boundary) await this.assertValidPolygon(input.boundary);
    await this.db
      .updateTable('zones')
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.boundary !== undefined && { boundary: geography(input.boundary) }),
        ...(input.isActive !== undefined && { is_active: input.isActive }),
        ...(input.deliveryBaseFeePaise !== undefined && {
          delivery_base_fee_paise: input.deliveryBaseFeePaise,
        }),
        ...(input.deliveryBaseKm !== undefined && { delivery_base_km: input.deliveryBaseKm }),
        ...(input.deliveryPerKmPaise !== undefined && {
          delivery_per_km_paise: input.deliveryPerKmPaise,
        }),
        ...(input.platformFeePaise !== undefined && { platform_fee_paise: input.platformFeePaise }),
        ...(input.freeDeliveryAbovePaise !== undefined && {
          free_delivery_above_paise: input.freeDeliveryAbovePaise,
        }),
        ...(input.surgeMultiplier !== undefined && { surge_multiplier: input.surgeMultiplier }),
        ...(input.rainMode !== undefined && { rain_mode: input.rainMode }),
      })
      .where('id', '=', id)
      .execute();
    const { boundary: _b, ...beforeFields } = before;
    await this.audit.record(this.db, {
      actorId,
      action: 'zone.update',
      entityType: 'zone',
      entityId: id,
      before: beforeFields,
      after: { ...input, boundary: input.boundary ? 'changed' : undefined },
    });
    return this.zone(id);
  }

  private async zone(id: string) {
    const zone = (await this.zones()).find((z) => z.id === id);
    if (!zone) throw AppError.notFound('Zone');
    return zone;
  }

  private async assertValidPolygon(polygon: CreateZoneDto['boundary']) {
    const { valid } = await sql<{
      valid: boolean;
    }>`select st_isvalid(st_geomfromgeojson(${JSON.stringify(polygon)})) as valid`
      .execute(this.db)
      .then((r) => r.rows[0]);
    if (!valid)
      throw AppError.badRequest(
        'INVALID_POLYGON',
        'Zone boundary is not a valid polygon (self-intersecting or unclosed)',
      );
  }
}

const geography = (polygon: CreateZoneDto['boundary']) =>
  sql<unknown>`st_setsrid(st_geomfromgeojson(${JSON.stringify(polygon)}), 4326)::geography`;
