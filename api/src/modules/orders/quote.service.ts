import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../common/errors/app-error';
import { haversineMeters } from '../../common/utils/geo';
import { DB, type Db } from '../../infra/database/database';
import type { DeliveryAddressSnapshot } from '../../infra/database/db.types';
import { GEO_PROVIDER, type GeoProvider } from '../../infra/geo/geo-provider';
import { KV_STORE, type KvStore } from '../../infra/kv/kv-store';
import { AddressesService } from '../addresses/addresses.service';
import { CatalogService } from '../catalog/catalog.service';
import { calculatePrice, type PriceBreakdown } from '../pricing/pricing.calculator';
import { CouponsService, toCouponTerms } from '../promotions/coupons.service';
import { toZonePricing, ZonesService } from '../zones/zones.service';
import { validateCart, type PricedLine } from './domain/cart-validation';
import type { QuoteDto, QuoteRequestDto } from './orders.dto';

export interface StoredQuote {
  id: string;
  userId: string;
  restaurantId: string;
  restaurantName: string;
  cityId: string;
  zoneId: string;
  address: DeliveryAddressSnapshot;
  pickup: { lat: number; lng: number };
  distanceM: number;
  travelSeconds: number;
  prepMinutes: number;
  lines: PricedLine[];
  pricing: PriceBreakdown;
  couponId: string | null;
  codAvailable: boolean;
  expiresAt: string;
}

const QUOTE_TTL_S = 5 * 60;
/** COD orders above this need online payment (fraud / rider cash risk). */
export const COD_LIMIT_PAISE = 300_000;

const quoteKey = (id: string) => `quote:${id}`;
const quoteUsedKey = (id: string) => `quote-used:${id}`;

/**
 * A quote is the server's binding price for a cart at a moment in time. Placing an
 * order only ever uses a stored quote, so the client can never inject prices.
 */
@Injectable()
export class QuoteService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KV_STORE) private readonly kv: KvStore,
    @Inject(GEO_PROVIDER) private readonly geo: GeoProvider,
    private readonly catalog: CatalogService,
    private readonly addresses: AddressesService,
    private readonly zones: ZonesService,
    private readonly coupons: CouponsService,
  ) {}

  async create(userId: string, input: QuoteRequestDto): Promise<QuoteDto> {
    const [{ restaurant, availability }, address, profile] = await Promise.all([
      this.catalog.availabilityOf(input.restaurantId),
      this.addresses.getOwned(userId, input.addressId),
      this.db
        .selectFrom('profiles')
        .select(['full_name', 'phone'])
        .where('id', '=', userId)
        .executeTakeFirstOrThrow(),
    ]);
    if (!availability.isOpen) {
      throw AppError.unprocessable(
        'RESTAURANT_CLOSED',
        `${restaurant.name} is not accepting orders right now`,
        { closedReason: availability.closedReason },
      );
    }

    const zone = await this.zones.locate(address.lat, address.lng);
    if (!zone || zone.city_id !== restaurant.city_id) {
      throw AppError.unprocessable(
        'ADDRESS_NOT_SERVICEABLE',
        'We do not deliver to this address yet',
      );
    }
    if (haversineMeters(address, restaurant) > restaurant.delivery_radius_m) {
      throw AppError.unprocessable(
        'OUT_OF_DELIVERY_RADIUS',
        `${restaurant.name} does not deliver to this address`,
      );
    }

    // uncached menu: checkout must see stock changes made seconds ago
    const menu = await this.catalog.publicMenu(restaurant.id, this.db);
    const cart = validateCart(menu, input.items);
    if (cart.issues.length)
      throw AppError.unprocessable('CART_INVALID', 'Some items in your cart need attention', {
        issues: cart.issues,
      });

    const itemTotal = cart.lines.reduce((acc, l) => acc + l.lineTotalPaise, 0);
    if (itemTotal < restaurant.min_order_paise) {
      throw AppError.unprocessable(
        'BELOW_MIN_ORDER',
        `Minimum order is ₹${restaurant.min_order_paise / 100}`,
        { minOrderPaise: restaurant.min_order_paise },
      );
    }

    let coupon = null;
    let couponError: QuoteDto['couponError'] = null;
    if (input.couponCode) {
      try {
        coupon = await this.coupons.evaluate(this.db, {
          code: input.couponCode,
          userId,
          restaurantId: restaurant.id,
          itemTotalPaise: itemTotal,
        });
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        couponError = { code: err.code, message: err.message };
      }
    }

    const route = await this.geo.route(restaurant, address);
    const pricing = calculatePrice({
      lines: cart.lines,
      packagingFeePaise: restaurant.packaging_fee_paise,
      distanceM: route.distanceM,
      zone: toZonePricing(zone),
      coupon: coupon ? toCouponTerms(coupon) : null,
      tipPaise: input.tipPaise,
    });

    const quote: StoredQuote = {
      id: randomUUID(),
      userId,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      cityId: zone.city_id,
      zoneId: zone.id,
      address: {
        label: address.label,
        line1: address.line1,
        line2: address.line2,
        landmark: address.landmark,
        city: address.city,
        pincode: address.pincode,
        lat: address.lat,
        lng: address.lng,
        contactName: profile.full_name,
        contactPhone: profile.phone,
      },
      pickup: { lat: restaurant.lat, lng: restaurant.lng },
      distanceM: route.distanceM,
      travelSeconds: route.durationS,
      prepMinutes: restaurant.avg_prep_minutes,
      lines: cart.lines,
      pricing,
      couponId: coupon?.id ?? null,
      codAvailable: pricing.totalPaise <= COD_LIMIT_PAISE,
      expiresAt: new Date(Date.now() + QUOTE_TTL_S * 1000).toISOString(),
    };
    await this.kv.set(quoteKey(quote.id), quote, { ttlSeconds: QUOTE_TTL_S + 60 });

    return {
      quoteId: quote.id,
      expiresAt: quote.expiresAt,
      restaurant: { id: restaurant.id, name: restaurant.name },
      deliveryAddress: quote.address,
      lines: cart.lines.map(({ variantId: _v, ...l }) => l),
      pricing,
      couponError,
      warnings: cart.warnings,
      etaMinutes: Math.ceil((restaurant.avg_prep_minutes * 60 + route.durationS + 300) / 60),
      distanceM: route.distanceM,
      codAvailable: quote.codAvailable,
    };
  }

  /** Single-use: a quote can back exactly one order. */
  async consume(userId: string, quoteId: string): Promise<StoredQuote> {
    const quote = await this.kv.get<StoredQuote>(quoteKey(quoteId));
    if (!quote || quote.userId !== userId || new Date(quote.expiresAt) < new Date()) {
      throw AppError.conflict(
        'QUOTE_EXPIRED',
        'Prices may have changed — please review your cart again',
      );
    }
    const claimed = await this.kv.set(quoteUsedKey(quoteId), 1, {
      ttlSeconds: QUOTE_TTL_S + 60,
      onlyIfAbsent: true,
    });
    if (!claimed) throw AppError.conflict('QUOTE_ALREADY_USED', 'This cart was already ordered');
    return quote;
  }

  async release(quoteId: string) {
    await this.kv.del(quoteUsedKey(quoteId)).catch(() => undefined);
  }
}
