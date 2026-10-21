import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';
import { AppError } from '../../common/errors/app-error';
import { haversineMeters } from '../../common/utils/geo';
import { DB, type Db } from '../../infra/database/database';
import type { Order } from '../../infra/database/db.types';
import { GEO_PROVIDER, type GeoProvider } from '../../infra/geo/geo-provider';
import { KV_STORE, type KvStore } from '../../infra/kv/kv-store';
import { topics } from '../../infra/realtime/realtime-publisher';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { OrderWorkflow, SYSTEM, type Actor } from '../orders/order-workflow.service';
import { LOCATION_FRESH_MS, trackingKeys, type LiveLocation } from '../tracking/tracking.keys';
import { DispatchConfigService } from './dispatch-config.service';
import { rankCandidates, riderPayoutPaise, type DispatchCandidate } from './domain/scoring';
import { RiderPool } from './rider-pool.service';

const DISPATCHABLE = ['ACCEPTED', 'READY'] as const;
const attemptsKey = (orderId: string) => `dispatch:attempts:${orderId}`;
const startLockKey = (orderId: string) => `lock:dispatch:${orderId}`;
const assignLockKey = (orderId: string) => `lock:assign:${orderId}`;

/**
 * Sequential-offer dispatch: one rider at a time gets a short-lived offer; on reject or
 * timeout the next best rider is tried with a wider radius and a higher payout.
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KV_STORE) private readonly kv: KvStore,
    @Inject(GEO_PROVIDER) private readonly geo: GeoProvider,
    private readonly workflow: OrderWorkflow,
    private readonly outbox: OutboxService,
    private readonly pool: RiderPool,
    private readonly config: DispatchConfigService,
  ) {}

  async start(orderId: string): Promise<void> {
    // one dispatcher per order at a time, across all API instances
    if (!(await this.kv.set(startLockKey(orderId), 1, { ttlSeconds: 15, onlyIfAbsent: true })))
      return;
    try {
      await this.dispatchOnce(orderId);
    } finally {
      await this.kv.del(startLockKey(orderId));
    }
  }

  private async dispatchOnce(orderId: string) {
    const order = await this.db
      .selectFrom('orders')
      .selectAll()
      .where('id', '=', orderId)
      .executeTakeFirst();
    if (!order || order.rider_id || !DISPATCHABLE.includes(order.status as never)) return;
    if (!['UNASSIGNED', 'SEARCHING', 'FAILED'].includes(order.dispatch_status)) return;

    const liveOffer = await this.db
      .selectFrom('rider_offers')
      .select('id')
      .where('order_id', '=', orderId)
      .where('status', '=', 'pending')
      .where('expires_at', '>', new Date())
      .executeTakeFirst();
    if (liveOffer) return;

    const cfg = await this.config.get();
    const attempt = await this.kv.incr(attemptsKey(orderId), 6 * 60 * 60);
    const radius = cfg.radiiMeters[Math.min(attempt - 1, cfg.radiiMeters.length - 1)];

    if (order.dispatch_status !== 'SEARCHING') {
      await this.workflow.run((tx) =>
        this.workflow.setDispatch(tx, {
          orderId,
          to: 'SEARCHING',
          actor: SYSTEM,
          metadata: { attempt },
        }),
      );
    }

    const candidates = await this.findCandidates(order, radius);
    if (!candidates.length) {
      if (attempt >= cfg.maxAttempts) {
        this.logger.warn(`dispatch failed for ${order.short_code} after ${attempt} attempts`);
        await this.workflow.run((tx) =>
          this.workflow.setDispatch(tx, {
            orderId,
            to: 'FAILED',
            from: ['SEARCHING'],
            actor: SYSTEM,
            metadata: { attempt },
          }),
        );
        return;
      }
      await this.workflow.run((tx) =>
        this.outbox.enqueue(tx, 'job.schedule', {
          name: 'dispatch.retry',
          payload: { orderId },
          delaySeconds: cfg.retryDelaySeconds,
          dedupeId: `dispatch-retry-${orderId}-${attempt}`,
        }),
      );
      return;
    }

    const [best] = rankCandidates(candidates);
    const payoutPaise = riderPayoutPaise(order.distance_m + best.distanceToRestaurantM, attempt);
    const expiresAt = new Date(Date.now() + cfg.offerTimeoutSeconds * 1000);
    const restaurant = await this.db
      .selectFrom('restaurants')
      .select(['name', 'address_line'])
      .where('id', '=', order.restaurant_id)
      .executeTakeFirstOrThrow();

    await this.workflow.run(async (tx) => {
      const offer = await tx
        .insertInto('rider_offers')
        .values({
          order_id: orderId,
          rider_id: best.riderId,
          score: best.score,
          distance_m: best.distanceToRestaurantM,
          payout_paise: payoutPaise,
          expires_at: expiresAt,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await tx
        .updateTable('riders')
        .set({ offers_received: sql`offers_received + 1` })
        .where('id', '=', best.riderId)
        .execute();
      await this.workflow.recordEvent(tx, orderId, 'RIDER_OFFERED', SYSTEM, {
        riderId: best.riderId,
        offerId: offer.id,
        attempt,
        score: best.score,
      });

      const payload = {
        offerId: offer.id,
        orderId,
        shortCode: order.short_code,
        restaurantName: restaurant.name,
        restaurantAddress: restaurant.address_line,
        pickup: { lat: order.pickup_lat, lng: order.pickup_lng },
        drop: { lat: order.drop_lat, lng: order.drop_lng },
        pickupDistanceM: best.distanceToRestaurantM,
        tripDistanceM: order.distance_m,
        payoutPaise,
        isCod: order.payment_method === 'cod',
        collectPaise: order.payment_method === 'cod' ? order.total_paise : 0,
        expiresAt: expiresAt.toISOString(),
      };
      await this.outbox.enqueue(tx, 'realtime.publish', {
        messages: [{ topic: topics.rider(best.riderId), event: 'offer', payload }],
      });
      await this.outbox.enqueue(tx, 'push.user', {
        userId: best.riderId,
        app: 'rider',
        message: {
          title: `New delivery · ₹${Math.round(payoutPaise / 100)}`,
          body: `Pickup from ${restaurant.name} · ${(best.distanceToRestaurantM / 1000).toFixed(1)} km away`,
          channel: 'offers',
          data: { type: 'offer', offerId: offer.id, orderId },
        },
      });
      await this.outbox.enqueue(tx, 'job.schedule', {
        name: 'dispatch.offer-timeout',
        payload: { offerId: offer.id },
        delaySeconds: cfg.offerTimeoutSeconds + 2,
        dedupeId: `offer-timeout-${offer.id}`,
      });
    });
  }

  async acceptOffer(riderId: string, offerId: string): Promise<Order> {
    const offer = await this.db
      .selectFrom('rider_offers')
      .selectAll()
      .where('id', '=', offerId)
      .where('rider_id', '=', riderId)
      .executeTakeFirst();
    if (!offer) throw AppError.notFound('Offer');
    if (
      !(await this.kv.set(assignLockKey(offer.order_id), riderId, {
        ttlSeconds: 10,
        onlyIfAbsent: true,
      }))
    ) {
      throw AppError.conflict('OFFER_TAKEN', 'This order is being assigned to someone else');
    }
    try {
      const order = await this.workflow.run(async (tx) => {
        const current = await tx
          .selectFrom('rider_offers')
          .selectAll()
          .where('id', '=', offerId)
          .forUpdate()
          .executeTakeFirstOrThrow();
        if (current.status !== 'pending' || current.expires_at < new Date()) {
          if (current.status === 'pending')
            await tx
              .updateTable('rider_offers')
              .set({ status: 'expired' })
              .where('id', '=', offerId)
              .execute();
          throw AppError.conflict('OFFER_EXPIRED', 'This offer has expired');
        }
        const locked = await this.workflow.lock(tx, current.order_id);
        if (locked.rider_id || !DISPATCHABLE.includes(locked.status as never)) {
          await tx
            .updateTable('rider_offers')
            .set({ status: 'cancelled', responded_at: new Date() })
            .where('id', '=', offerId)
            .execute();
          throw AppError.conflict('ORDER_UNAVAILABLE', 'This order is no longer available');
        }
        const rider = await tx
          .selectFrom('riders')
          .selectAll()
          .where('id', '=', riderId)
          .forUpdate()
          .executeTakeFirstOrThrow();
        if (rider.current_order_id)
          throw AppError.conflict('RIDER_BUSY', 'Finish your current delivery first');
        if (!rider.is_online)
          throw AppError.conflict('RIDER_OFFLINE', 'Go online to accept orders');

        await tx
          .updateTable('rider_offers')
          .set({ status: 'accepted', responded_at: new Date() })
          .where('id', '=', offerId)
          .execute();
        await tx
          .updateTable('riders')
          .set({ current_order_id: locked.id, offers_accepted: sql`offers_accepted + 1` })
          .where('id', '=', riderId)
          .execute();
        return this.workflow.setDispatch(tx, {
          orderId: locked.id,
          to: 'ASSIGNED',
          from: ['SEARCHING', 'UNASSIGNED', 'FAILED'],
          actor: { type: 'rider', id: riderId },
          patch: { rider_id: riderId },
          metadata: { offerId },
        });
      });
      await this.pool.markBusy(riderId, order.city_id);
      await this.kv.del(attemptsKey(order.id));
      return order;
    } finally {
      await this.kv.del(assignLockKey(offer.order_id));
    }
  }

  async rejectOffer(riderId: string, offerId: string, reason?: string) {
    const updated = await this.db
      .updateTable('rider_offers')
      .set({ status: 'rejected', responded_at: new Date() })
      .where('id', '=', offerId)
      .where('rider_id', '=', riderId)
      .where('status', '=', 'pending')
      .returning('order_id')
      .executeTakeFirst();
    if (!updated) throw AppError.conflict('OFFER_EXPIRED', 'This offer is no longer active');
    this.logger.debug(`offer ${offerId} rejected: ${reason ?? 'no reason'}`);
    await this.start(updated.order_id);
  }

  async expireOffer(offerId: string) {
    const updated = await this.db
      .updateTable('rider_offers')
      .set({ status: 'expired' })
      .where('id', '=', offerId)
      .where('status', '=', 'pending')
      .returning('order_id')
      .executeTakeFirst();
    if (updated) await this.start(updated.order_id);
  }

  /** Takes the order away from its rider (offline, stuck, or by ops) and searches again. */
  async reassign(orderId: string, actor: Actor, reason: string) {
    const previous = await this.workflow.run(async (tx) => {
      const order = await this.workflow.lock(tx, orderId);
      if (['PICKED', 'AT_DROP', 'DONE'].includes(order.dispatch_status)) {
        throw AppError.conflict('CANNOT_REASSIGN', 'The food has already been picked up');
      }
      if (!order.rider_id) return null;
      await tx
        .updateTable('riders')
        .set({ current_order_id: null })
        .where('id', '=', order.rider_id)
        .where('current_order_id', '=', orderId)
        .execute();
      await tx
        .updateTable('rider_offers')
        .set({ status: 'cancelled' })
        .where('order_id', '=', orderId)
        .where('status', '=', 'accepted')
        .execute();
      await this.workflow.setDispatch(tx, {
        orderId,
        to: 'SEARCHING',
        actor,
        patch: { rider_id: null },
        metadata: { reason, previousRiderId: order.rider_id },
      });
      await this.outbox.enqueue(tx, 'push.user', {
        userId: order.rider_id,
        app: 'rider',
        message: {
          title: 'Order reassigned',
          body: `Order #${order.short_code} was moved to another partner`,
          data: { type: 'reassigned', orderId },
        },
      });
      return { riderId: order.rider_id, cityId: order.city_id };
    });
    if (previous) await this.releaseRider(previous.riderId, previous.cityId);
    await this.kv.del(attemptsKey(orderId));
    await this.start(orderId);
  }

  /** Order finished or cancelled: close offers and free the rider. Idempotent. */
  async onOrderClosed(orderId: string) {
    const order = await this.db
      .selectFrom('orders')
      .select(['id', 'rider_id', 'city_id'])
      .where('id', '=', orderId)
      .executeTakeFirst();
    if (!order) return;
    await this.db
      .updateTable('rider_offers')
      .set({ status: 'cancelled' })
      .where('order_id', '=', orderId)
      .where('status', '=', 'pending')
      .execute();
    await this.kv.del(attemptsKey(orderId));
    if (!order.rider_id) return;
    await this.db
      .updateTable('riders')
      .set({ current_order_id: null })
      .where('id', '=', order.rider_id)
      .where('current_order_id', '=', orderId)
      .execute();
    await this.releaseRider(order.rider_id, order.city_id);
  }

  private async releaseRider(riderId: string, cityId: string) {
    const rider = await this.db
      .selectFrom('riders')
      .select(['is_online', 'current_order_id'])
      .where('id', '=', riderId)
      .executeTakeFirst();
    if (rider?.is_online && !rider.current_order_id) await this.pool.markIdle(riderId, cityId);
  }

  private async findCandidates(order: Order, radiusM: number): Promise<DispatchCandidate[]> {
    const pickup = { lat: order.pickup_lat, lng: order.pickup_lng };
    const offered = new Set(
      (
        await this.db
          .selectFrom('rider_offers')
          .select('rider_id')
          .where('order_id', '=', order.id)
          .execute()
      ).map((r) => r.rider_id),
    );

    let ids: string[];
    try {
      const [hits, idle] = await Promise.all([
        this.kv.geoSearch(
          trackingKeys.ridersGeo(order.city_id),
          pickup.lng,
          pickup.lat,
          radiusM,
          25,
        ),
        this.kv.smembers(trackingKeys.idleRiders(order.city_id)),
      ]);
      const idleSet = new Set(idle);
      ids = hits.map((h) => h.member).filter((id) => idleSet.has(id) && !offered.has(id));
    } catch (err) {
      // Redis outage: fall back to last persisted positions in Postgres
      this.logger.warn(`geo index unavailable, using database fallback: ${(err as Error).message}`);
      const rows = await this.db
        .selectFrom('riders')
        .select(['id', 'last_lat', 'last_lng'])
        .where('city_id', '=', order.city_id)
        .where('is_online', '=', true)
        .where('current_order_id', 'is', null)
        .where('last_seen_at', '>', new Date(Date.now() - LOCATION_FRESH_MS))
        .execute();
      ids = rows
        .filter(
          (r) =>
            r.last_lat !== null &&
            r.last_lng !== null &&
            haversineMeters(pickup, { lat: r.last_lat, lng: r.last_lng }) <= radiusM,
        )
        .map((r) => r.id)
        .filter((id) => !offered.has(id));
    }
    if (!ids.length) return [];

    let q = this.db
      .selectFrom('riders')
      .select([
        'id',
        'rating_avg',
        'rating_count',
        'offers_received',
        'offers_accepted',
        'last_lat',
        'last_lng',
        'last_seen_at',
      ])
      .where('id', 'in', ids)
      .where('is_online', '=', true)
      .where('kyc_status', '=', 'approved')
      .where('current_order_id', 'is', null);
    // riders already holding too much cash cannot take more COD orders
    if (order.payment_method === 'cod')
      q = q.where(sql<boolean>`cash_in_hand_paise + ${order.total_paise} <= cash_limit_paise`);
    const riders = await q.execute();

    const located = (
      await Promise.all(
        riders.map(async (r) => {
          const live = await this.pool.location(r.id).catch(() => null);
          const position: LiveLocation | null =
            live ??
            (r.last_lat !== null && r.last_lng !== null && r.last_seen_at
              ? {
                  lat: r.last_lat,
                  lng: r.last_lng,
                  heading: null,
                  speedMps: null,
                  at: r.last_seen_at.toISOString(),
                }
              : null);
          if (!position || Date.now() - new Date(position.at).getTime() > LOCATION_FRESH_MS)
            return null;
          return {
            rider: r,
            position,
            idleSeconds: await this.pool.idleSeconds(r.id).catch(() => 0),
          };
        }),
      )
    ).filter((x): x is NonNullable<typeof x> => x !== null);
    if (!located.length) return [];

    const etas = await this.geo.etaToDestination(
      located.map((l) => l.position),
      pickup,
    );
    return located.map((l, i) => ({
      riderId: l.rider.id,
      etaToRestaurantS: etas[i].durationS,
      distanceToRestaurantM: etas[i].distanceM,
      idleSeconds: l.idleSeconds,
      acceptanceRate: l.rider.offers_received
        ? l.rider.offers_accepted / l.rider.offers_received
        : 1,
      ratingAvg: l.rider.rating_avg,
      ratingCount: l.rider.rating_count,
    }));
  }
}
