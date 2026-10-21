import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { iso } from '../../common/http/schemas';
import { ENV, type Env } from '../../config/env';
import { DB, type Db, type Executor } from '../../infra/database/database';
import type { Order } from '../../infra/database/db.types';
import { KV_STORE, type KvStore } from '../../infra/kv/kv-store';
import { StorageService } from '../../infra/storage/storage.service';
import { trackingKeys, type LiveLocation } from '../tracking/tracking.keys';
import { deliveryOtp } from './domain/delivery-otp';
import { ACTIVE_ORDER_STATUSES } from './domain/order-state-machine';
import type { CustomerOrderDto } from './orders.dto';

/** Everything any audience might show about one order, loaded in parallel. */
@Injectable()
export class OrderReader {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KV_STORE) private readonly kv: KvStore,
    @Inject(ENV) private readonly env: Env,
    private readonly storage: StorageService,
  ) {}

  /** Signed URL for the doorstep photo, visible to the order's parties after hand-off. */
  async proofUrl(order: Order): Promise<string | null> {
    if (
      !order.delivery_proof_path ||
      (order.status !== 'DELIVERED' && order.status !== 'UNDELIVERED')
    )
      return null;
    return this.storage.signedUrl('delivery-proofs', order.delivery_proof_path, 3600);
  }

  async loadFull(orderId: string, executor: Executor = this.db) {
    const order = await executor
      .selectFrom('orders')
      .selectAll()
      .where('id', '=', orderId)
      .executeTakeFirst();
    if (!order) throw AppError.notFound('Order');
    const [items, restaurant, rider, customer, events, rating] = await Promise.all([
      executor.selectFrom('order_items').selectAll().where('order_id', '=', orderId).execute(),
      executor
        .selectFrom('restaurants')
        .select(['id', 'name', 'phone', 'address_line', 'lat', 'lng', 'logo_url'])
        .where('id', '=', order.restaurant_id)
        .executeTakeFirstOrThrow(),
      order.rider_id
        ? executor
            .selectFrom('riders as r')
            .innerJoin('profiles as p', 'p.id', 'r.id')
            .select([
              'r.id',
              'p.full_name',
              'p.phone',
              'r.vehicle_type',
              'r.vehicle_number',
              'r.rating_avg',
              'r.last_lat',
              'r.last_lng',
              'r.last_seen_at',
            ])
            .where('r.id', '=', order.rider_id)
            .executeTakeFirst()
        : undefined,
      executor
        .selectFrom('profiles')
        .select(['id', 'full_name', 'phone'])
        .where('id', '=', order.customer_id)
        .executeTakeFirstOrThrow(),
      executor
        .selectFrom('order_events')
        .selectAll()
        .where('order_id', '=', orderId)
        .orderBy('id')
        .execute(),
      executor
        .selectFrom('ratings')
        .select('id')
        .where('order_id', '=', orderId)
        .executeTakeFirst(),
    ]);
    return {
      order,
      items,
      restaurant,
      rider: rider ?? null,
      customer,
      events,
      rated: rating !== undefined,
    };
  }

  async liveRiderLocation(riderId: string | null): Promise<LiveLocation | null> {
    if (!riderId) return null;
    return this.kv.get<LiveLocation>(trackingKeys.riderLocation(riderId)).catch(() => null);
  }

  async customerView(orderId: string, customerId: string): Promise<CustomerOrderDto> {
    const full = await this.loadFull(orderId);
    if (full.order.customer_id !== customerId) throw AppError.notFound('Order');
    const live = await this.liveRiderLocation(full.order.rider_id);
    const { order } = full;
    const active = ACTIVE_ORDER_STATUSES.includes(order.status);

    return {
      id: order.id,
      shortCode: order.short_code,
      status: order.status,
      dispatchStatus: order.dispatch_status,
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status,
      restaurant: {
        id: full.restaurant.id,
        name: full.restaurant.name,
        phone: active ? full.restaurant.phone : null,
        addressLine: full.restaurant.address_line,
        lat: full.restaurant.lat,
        lng: full.restaurant.lng,
        logoUrl: full.restaurant.logo_url,
      },
      deliveryAddress: order.delivery_address,
      items: toLines(full.items),
      pricing: pricingOf(order),
      rider: full.rider
        ? {
            id: full.rider.id,
            // no phone number: calls go through the masked-calling endpoint
            name: full.rider.full_name,
            vehicleType: full.rider.vehicle_type,
            vehicleNumber: full.rider.vehicle_number,
            ratingAvg: Math.round(full.rider.rating_avg * 10) / 10,
            lat: live?.lat ?? full.rider.last_lat,
            lng: live?.lng ?? full.rider.last_lng,
            lastSeenAt: live?.at ?? iso(full.rider.last_seen_at),
          }
        : null,
      deliveryOtp:
        active && order.status !== 'PAYMENT_PENDING'
          ? deliveryOtp(this.env.APP_SECRET, order.id)
          : null,
      deliveryProofUrl: await this.proofUrl(order),
      prepMinutes: order.prep_minutes,
      estimatedDeliveryAt: iso(order.estimated_delivery_at),
      customerNote: order.customer_note,
      cancelReason: order.cancel_reason,
      cancelledBy: order.cancelled_by,
      canCancel: order.status === 'PAYMENT_PENDING' || order.status === 'PLACED',
      canRate: order.status === 'DELIVERED' && !full.rated,
      timeline: full.events
        .filter((e) => e.event.startsWith('STATUS_') || e.event === 'DISPATCH_ASSIGNED')
        .map((e) => ({ event: e.event, status: e.to_status, at: e.created_at.toISOString() })),
      createdAt: order.created_at.toISOString(),
      deliveredAt: iso(order.delivered_at),
    };
  }
}

export function pricingOf(order: Order) {
  const p = order.pricing as Record<string, unknown>;
  return {
    itemTotalPaise: order.item_total_paise,
    packagingFeePaise: order.packaging_fee_paise,
    deliveryFeePaise: order.delivery_fee_paise,
    deliveryFeeWaivedPaise: Number(p.deliveryFeeWaivedPaise ?? 0),
    rainSurchargePaise: Number(p.rainSurchargePaise ?? 0),
    platformFeePaise: order.platform_fee_paise,
    discountPaise: order.discount_paise,
    taxPaise: order.tax_paise,
    tipPaise: order.tip_paise,
    totalPaise: order.total_paise,
    surgeMultiplier: Number(p.surgeMultiplier ?? 1),
    couponCode: (p.couponCode as string | null) ?? null,
  };
}

export function toLines(
  items: {
    menu_item_id: string | null;
    name: string;
    variant_name: string | null;
    addons: { id: string; name: string; pricePaise: number }[];
    is_veg: boolean;
    unit_price_paise: number;
    quantity: number;
    line_total_paise: number;
  }[],
) {
  return items.map((i) => ({
    menuItemId: i.menu_item_id,
    name: i.name,
    variantName: i.variant_name,
    addons: i.addons,
    isVeg: i.is_veg,
    unitPricePaise: i.unit_price_paise,
    quantity: i.quantity,
    lineTotalPaise: i.line_total_paise,
  }));
}
