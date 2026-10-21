import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { AppError } from '../../common/errors/app-error';
import { decodeGeohashCenter, encodeGeohash, haversineMeters } from '../../common/utils/geo';
import type { OpeningSlot } from '../../common/utils/opening-hours';
import { DB, type Db, type Executor } from '../../infra/database/database';
import type { Restaurant } from '../../infra/database/db.types';
import { point, ZonesService } from '../zones/zones.service';
import { CatalogCache, menuKey, nearbyKey } from './catalog.cache';
import type {
  MenuCategoryView,
  NearbyQueryDto,
  RestaurantDetailDto,
  SearchResultDto,
} from './catalog.dto';
import { MenuRepository } from './menu.repository';
import {
  estimateDeliveryMinutes,
  restaurantAvailability,
  type Availability,
} from './restaurant-availability';

type CachedRestaurant = Omit<
  Restaurant,
  'busy_until' | 'created_at' | 'updated_at' | 'last_heartbeat_at'
> & {
  busy_until: string | null;
  hours: OpeningSlot[];
  timezone: string;
};

const NEARBY_TTL_S = 60;
const MENU_TTL_S = 600;
const NEARBY_LIMIT = 150;

@Injectable()
export class CatalogService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly zones: ZonesService,
    private readonly menus: MenuRepository,
    private readonly cache: CatalogCache,
  ) {}

  async nearby(q: NearbyQueryDto) {
    const zone = await this.zones.locate(q.lat, q.lng);
    if (!zone) return { serviceable: false, restaurants: [], cuisines: [] };

    const candidates = await this.candidatesNear(q.lat, q.lng);
    const now = new Date();
    let cards = candidates
      .map((r) => this.toCard(r, q.lat, q.lng, now))
      // the geohash cell is coarse; re-check the exact radius from the real point
      .filter((c, i) => c.distanceM <= candidates[i].delivery_radius_m);

    const cuisines = [...new Set(cards.flatMap((c) => c.cuisines))].sort();
    if (q.cuisine)
      cards = cards.filter((c) =>
        c.cuisines.some((x) => x.toLowerCase() === q.cuisine!.toLowerCase()),
      );
    if (q.vegOnly) cards = cards.filter((c) => c.isVegOnly);

    return { serviceable: true, restaurants: sortCards(cards, q.sort), cuisines };
  }

  async detail(restaurantId: string, lat?: number, lng?: number): Promise<RestaurantDetailDto> {
    const r = await this.db
      .selectFrom('restaurants as r')
      .innerJoin('cities as c', 'c.id', 'r.city_id')
      .selectAll('r')
      .select('c.timezone')
      .where('r.id', '=', restaurantId)
      .where('r.status', 'in', ['active', 'suspended'])
      .executeTakeFirst();
    if (!r) throw AppError.notFound('Restaurant');

    const [hours, menu] = await Promise.all([this.hoursFor([r.id]), this.publicMenu(r.id)]);
    const availability = restaurantAvailability(r, hours.get(r.id) ?? [], new Date(), r.timezone);
    const hasPoint = lat !== undefined && lng !== undefined;
    const distanceM = hasPoint ? haversineMeters({ lat, lng }, r) : null;

    return {
      id: r.id,
      name: r.name,
      description: r.description,
      cuisines: r.cuisines,
      coverImageUrl: r.cover_image_url,
      logoUrl: r.logo_url,
      addressLine: r.address_line,
      lat: r.lat,
      lng: r.lng,
      ratingAvg: round1(r.rating_avg),
      ratingCount: r.rating_count,
      costForTwoPaise: r.cost_for_two_paise,
      minOrderPaise: r.min_order_paise,
      packagingFeePaise: r.packaging_fee_paise,
      isVegOnly: r.is_veg_only,
      ...availability,
      deliversToLocation: distanceM === null ? undefined : distanceM <= r.delivery_radius_m,
      distanceM,
      etaMinutes:
        distanceM === null ? null : estimateDeliveryMinutes(r.avg_prep_minutes, distanceM),
      menu,
    };
  }

  async search(q: { q: string; lat: number; lng: number }): Promise<SearchResultDto> {
    const zone = await this.zones.locate(q.lat, q.lng);
    if (!zone) return { restaurants: [], dishes: [] };
    const candidates = await this.candidatesNear(q.lat, q.lng);
    const ids = candidates.map((c) => c.id);
    if (!ids.length) return { restaurants: [], dishes: [] };

    const term = q.q.toLowerCase();
    const now = new Date();
    const cardsById = new Map(candidates.map((r) => [r.id, this.toCard(r, q.lat, q.lng, now)]));

    const restaurants = candidates
      .filter(
        (r) =>
          r.name.toLowerCase().includes(term) ||
          r.cuisines.some((c) => c.toLowerCase().includes(term)),
      )
      .map((r) => cardsById.get(r.id)!);

    // trigram similarity catches typos ("biriyani" → "Biryani")
    const dishRows = await this.db
      .selectFrom('menu_items')
      .select(['id', 'name', 'price_paise', 'is_veg', 'image_url', 'restaurant_id'])
      .where('restaurant_id', 'in', ids)
      .where('is_active', '=', true)
      .where('in_stock', '=', true)
      .where((eb) =>
        eb.or([
          eb('name', 'ilike', `%${escapeLike(q.q)}%`),
          eb(sql<boolean>`similarity(name, ${q.q}) > 0.3`, '=', true),
        ]),
      )
      .orderBy(sql`similarity(name, ${q.q})`, 'desc')
      .limit(30)
      .execute();

    return {
      restaurants: sortCards(restaurants, 'relevance'),
      dishes: dishRows.map((d) => ({
        itemId: d.id,
        name: d.name,
        pricePaise: d.price_paise,
        isVeg: d.is_veg,
        imageUrl: d.image_url,
        restaurant: cardsById.get(d.restaurant_id)!,
      })),
    };
  }

  /** Public (active, cached) menu — the same view the quote validates against. */
  publicMenu(restaurantId: string, executor?: Executor): Promise<MenuCategoryView[]> {
    if (executor) return this.menus.loadMenu(restaurantId, { includeInactive: false }, executor);
    return this.cache.getOrLoad(menuKey(restaurantId), MENU_TTL_S, () =>
      this.menus.loadMenu(restaurantId, { includeInactive: false }),
    );
  }

  async availabilityOf(
    restaurantId: string,
    executor: Executor = this.db,
  ): Promise<{ restaurant: Restaurant & { timezone: string }; availability: Availability }> {
    const r = await executor
      .selectFrom('restaurants as r')
      .innerJoin('cities as c', 'c.id', 'r.city_id')
      .selectAll('r')
      .select('c.timezone')
      .where('r.id', '=', restaurantId)
      .executeTakeFirst();
    if (!r) throw AppError.notFound('Restaurant');
    const hours = await this.hoursFor([r.id], executor);
    return {
      restaurant: r,
      availability: restaurantAvailability(r, hours.get(r.id) ?? [], new Date(), r.timezone),
    };
  }

  /** Restaurants whose delivery radius may cover the point — cached per ~1km geohash cell. */
  private candidatesNear(lat: number, lng: number): Promise<CachedRestaurant[]> {
    const cell = encodeGeohash({ lat, lng }, 6);
    return this.cache.getOrLoad(nearbyKey(cell), NEARBY_TTL_S, async () => {
      const center = decodeGeohashCenter(cell);
      // pad by the cell's half-diagonal (~700m) so edge-of-cell points are never missed
      const rows = await this.db
        .selectFrom('restaurants as r')
        .innerJoin('cities as c', 'c.id', 'r.city_id')
        .selectAll('r')
        .select('c.timezone')
        .where('r.status', '=', 'active')
        .where(
          sql<boolean>`st_dwithin(r.location, ${point(center.lat, center.lng)}, r.delivery_radius_m + 700)`,
        )
        .orderBy(sql`st_distance(r.location, ${point(center.lat, center.lng)})`)
        .limit(NEARBY_LIMIT)
        .execute();
      const hours = await this.hoursFor(rows.map((r) => r.id));
      return rows.map(({ created_at: _c, updated_at: _u, last_heartbeat_at: _h, ...r }) => ({
        ...r,
        busy_until: r.busy_until?.toISOString() ?? null,
        hours: hours.get(r.id) ?? [],
      }));
    });
  }

  private async hoursFor(ids: string[], executor: Executor = this.db) {
    const map = new Map<string, OpeningSlot[]>();
    if (!ids.length) return map;
    const rows = await executor
      .selectFrom('restaurant_hours')
      .selectAll()
      .where('restaurant_id', 'in', ids)
      .execute();
    for (const h of rows) {
      map.set(h.restaurant_id, [
        ...(map.get(h.restaurant_id) ?? []),
        { dayOfWeek: h.day_of_week, opensAt: h.opens_at, closesAt: h.closes_at },
      ]);
    }
    return map;
  }

  private toCard(r: CachedRestaurant, lat: number, lng: number, now: Date) {
    const distanceM = haversineMeters({ lat, lng }, r);
    const availability = restaurantAvailability(
      {
        status: r.status,
        is_open: r.is_open,
        busy_until: r.busy_until ? new Date(r.busy_until) : null,
      },
      r.hours,
      now,
      r.timezone,
    );
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      cuisines: r.cuisines,
      coverImageUrl: r.cover_image_url,
      logoUrl: r.logo_url,
      ratingAvg: round1(r.rating_avg),
      ratingCount: r.rating_count,
      costForTwoPaise: r.cost_for_two_paise,
      isVegOnly: r.is_veg_only,
      distanceM,
      etaMinutes: estimateDeliveryMinutes(r.avg_prep_minutes, distanceM),
      ...availability,
    };
  }
}

type Card = ReturnType<CatalogService['toCard']>;

function sortCards(cards: Card[], sort: NearbyQueryDto['sort']): Card[] {
  const openFirst = (a: Card, b: Card) => Number(b.isOpen) - Number(a.isOpen);
  const by: Record<NearbyQueryDto['sort'], (a: Card, b: Card) => number> = {
    relevance: (a, b) =>
      openFirst(a, b) ||
      b.ratingAvg * Math.log10(b.ratingCount + 10) - a.ratingAvg * Math.log10(a.ratingCount + 10) ||
      a.distanceM - b.distanceM,
    rating: (a, b) => openFirst(a, b) || b.ratingAvg - a.ratingAvg,
    delivery_time: (a, b) => openFirst(a, b) || a.etaMinutes - b.etaMinutes,
    cost_low: (a, b) => openFirst(a, b) || (a.costForTwoPaise ?? 0) - (b.costForTwoPaise ?? 0),
    cost_high: (a, b) => openFirst(a, b) || (b.costForTwoPaise ?? 0) - (a.costForTwoPaise ?? 0),
  };
  return [...cards].sort(by[sort]);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
