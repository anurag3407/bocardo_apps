import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { iso } from '../../common/http/schemas';
import { DB, type Db } from '../../infra/database/database';
import { RealtimePublisher, topics } from '../../infra/realtime/realtime-publisher';
import { StorageService } from '../../infra/storage/storage.service';
import { AuditService } from '../../platform/audit/audit.service';
import { AppConfigService } from '../../platform/config/app-config.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { RiderPool } from '../dispatch/rider-pool.service';
import { verifyDeliveryOtp } from '../orders/domain/delivery-otp';
import { ACTIVE_ORDER_STATUSES } from '../orders/domain/order-state-machine';
import { OrderReader } from '../orders/order-reader.service';
import { OrderWorkflow } from '../orders/order-workflow.service';
import { UsersService } from '../users/users.service';
import { ZonesService } from '../zones/zones.service';
import type { RiderApplyDto, RiderOrderDto, RiderProfileDto, SosDto } from './riders.dto';

type DeliveryProofInput = { path: string; lat?: number; lng?: number };

/** Customer must have been unreachable at the door for this long before "undeliverable". */
const DOORSTEP_WAIT_MS = 10 * 60 * 1000;

@Injectable()
export class RidersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly users: UsersService,
    private readonly zones: ZonesService,
    private readonly pool: RiderPool,
    private readonly dispatch: DispatchService,
    private readonly workflow: OrderWorkflow,
    private readonly reader: OrderReader,
    private readonly realtime: RealtimePublisher,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    private readonly storage: StorageService,
  ) {}

  async apply(userId: string, input: RiderApplyDto): Promise<RiderProfileDto> {
    await this.db.transaction().execute(async (tx) => {
      const existing = await tx
        .selectFrom('riders')
        .select('id')
        .where('id', '=', userId)
        .executeTakeFirst();
      if (existing) throw AppError.conflict('ALREADY_APPLIED', 'You have already applied');
      await tx
        .updateTable('profiles')
        .set({ full_name: input.fullName })
        .where('id', '=', userId)
        .execute();
      await tx
        .insertInto('riders')
        .values({
          id: userId,
          vehicle_type: input.vehicleType,
          vehicle_number: input.vehicleNumber ?? null,
          license_number: input.licenseNumber ?? null,
        })
        .execute();
      await this.users.addRole(userId, 'rider', tx);
    });
    return this.profile(userId);
  }

  async profile(riderId: string): Promise<RiderProfileDto> {
    const r = await this.db
      .selectFrom('riders as r')
      .innerJoin('profiles as p', 'p.id', 'r.id')
      .selectAll('r')
      .select(['p.full_name', 'p.phone'])
      .where('r.id', '=', riderId)
      .executeTakeFirst();
    if (!r) throw AppError.notFound('Rider profile');
    return {
      id: r.id,
      fullName: r.full_name,
      phone: r.phone,
      kycStatus: r.kyc_status,
      vehicleType: r.vehicle_type,
      vehicleNumber: r.vehicle_number,
      isOnline: r.is_online,
      currentOrderId: r.current_order_id,
      cashInHandPaise: r.cash_in_hand_paise,
      cashLimitPaise: r.cash_limit_paise,
      ratingAvg: Math.round(r.rating_avg * 10) / 10,
      acceptanceRate: r.offers_received
        ? Math.round((r.offers_accepted / r.offers_received) * 100) / 100
        : 1,
    };
  }

  async goOnline(riderId: string, lat: number, lng: number) {
    const rider = await this.db
      .selectFrom('riders')
      .selectAll()
      .where('id', '=', riderId)
      .executeTakeFirst();
    if (!rider) throw AppError.notFound('Rider profile');
    if (rider.kyc_status !== 'approved')
      throw AppError.forbidden('Your documents are still being verified');
    const zone = await this.zones.locate(lat, lng);
    if (!zone)
      throw AppError.unprocessable(
        'OUTSIDE_SERVICE_AREA',
        'You are outside Bocardo delivery areas',
      );

    await this.db
      .updateTable('riders')
      .set({
        is_online: true,
        city_id: zone.city_id,
        last_lat: lat,
        last_lng: lng,
        last_seen_at: new Date(),
      })
      .where('id', '=', riderId)
      .execute();
    await this.pool.goOnline(
      riderId,
      zone.city_id,
      { lat, lng, heading: null, speedMps: null, at: new Date().toISOString() },
      rider.current_order_id !== null,
    );
    return this.profile(riderId);
  }

  async goOffline(riderId: string) {
    const rider = await this.db
      .selectFrom('riders')
      .select(['current_order_id', 'city_id'])
      .where('id', '=', riderId)
      .executeTakeFirst();
    if (!rider) throw AppError.notFound('Rider profile');
    if (rider.current_order_id)
      throw AppError.conflict(
        'ACTIVE_ORDER',
        'Complete your current delivery before going offline',
      );
    await this.db
      .updateTable('riders')
      .set({ is_online: false })
      .where('id', '=', riderId)
      .execute();
    if (rider.city_id) await this.pool.goOffline(riderId, rider.city_id);
    return this.profile(riderId);
  }

  /** Recovers the offer screen if the app was killed or the push was missed. */
  async currentOffer(riderId: string) {
    const offer = await this.db
      .selectFrom('rider_offers as f')
      .innerJoin('orders as o', 'o.id', 'f.order_id')
      .innerJoin('restaurants as r', 'r.id', 'o.restaurant_id')
      .select([
        'f.id',
        'f.order_id',
        'f.distance_m',
        'f.payout_paise',
        'f.expires_at',
        'o.short_code',
        'o.pickup_lat',
        'o.pickup_lng',
        'o.drop_lat',
        'o.drop_lng',
        'o.distance_m as trip_distance_m',
        'o.payment_method',
        'o.total_paise',
        'r.name as restaurant_name',
        'r.address_line',
      ])
      .where('f.rider_id', '=', riderId)
      .where('f.status', '=', 'pending')
      .where('f.expires_at', '>', new Date())
      .orderBy('f.created_at', 'desc')
      .executeTakeFirst();
    if (!offer) return { offer: null };
    return {
      offer: {
        offerId: offer.id,
        orderId: offer.order_id,
        shortCode: offer.short_code,
        restaurantName: offer.restaurant_name,
        restaurantAddress: offer.address_line,
        pickup: { lat: offer.pickup_lat, lng: offer.pickup_lng },
        drop: { lat: offer.drop_lat, lng: offer.drop_lng },
        pickupDistanceM: offer.distance_m,
        tripDistanceM: offer.trip_distance_m,
        payoutPaise: offer.payout_paise,
        isCod: offer.payment_method === 'cod',
        collectPaise: offer.payment_method === 'cod' ? offer.total_paise : 0,
        expiresAt: offer.expires_at.toISOString(),
      },
    };
  }

  async acceptOffer(riderId: string, offerId: string) {
    const order = await this.dispatch.acceptOffer(riderId, offerId);
    return this.orderView(riderId, order.id);
  }

  rejectOffer(riderId: string, offerId: string, reason?: string) {
    return this.dispatch.rejectOffer(riderId, offerId, reason);
  }

  async activeOrder(riderId: string) {
    const rider = await this.db
      .selectFrom('riders')
      .select('current_order_id')
      .where('id', '=', riderId)
      .executeTakeFirst();
    return {
      order: rider?.current_order_id ? await this.orderView(riderId, rider.current_order_id) : null,
    };
  }

  async history(riderId: string, cursor: string | undefined, limit: number) {
    let q = this.db
      .selectFrom('orders')
      .select(['id', 'created_at'])
      .where('rider_id', '=', riderId)
      .orderBy('created_at', 'desc')
      .limit(limit + 1);
    if (cursor) q = q.where('created_at', '<', new Date(cursor));
    const rows = await q.execute();
    const page = rows.slice(0, limit);
    return {
      items: await Promise.all(page.map((r) => this.orderView(riderId, r.id))),
      nextCursor: rows.length > limit ? page[page.length - 1].created_at.toISOString() : null,
    };
  }

  // ── Trip actions ──────────────────────────────────────────────────────────
  async arrivedAtRestaurant(riderId: string, orderId: string) {
    await this.assertAssigned(riderId, orderId);
    await this.workflow.run((tx) =>
      this.workflow.setDispatch(tx, {
        orderId,
        to: 'AT_RESTAURANT',
        from: ['ASSIGNED'],
        actor: { type: 'rider', id: riderId },
      }),
    );
    return this.orderView(riderId, orderId);
  }

  async pickedUp(riderId: string, orderId: string) {
    await this.assertAssigned(riderId, orderId);
    await this.workflow.run(async (tx) => {
      const actor = { type: 'rider' as const, id: riderId };
      await this.workflow.transition(tx, {
        orderId,
        to: 'PICKED_UP',
        from: ['ACCEPTED', 'READY'],
        actor,
      });
      await this.workflow.setDispatch(tx, {
        orderId,
        to: 'PICKED',
        from: ['ASSIGNED', 'AT_RESTAURANT'],
        actor,
      });
    });
    return this.orderView(riderId, orderId);
  }

  async arrivedAtDrop(riderId: string, orderId: string) {
    await this.assertAssigned(riderId, orderId);
    await this.workflow.run((tx) =>
      this.workflow.setDispatch(tx, {
        orderId,
        to: 'AT_DROP',
        from: ['PICKED'],
        actor: { type: 'rider', id: riderId },
      }),
    );
    return this.orderView(riderId, orderId);
  }

  async deliver(riderId: string, orderId: string, otp: string, proof?: DeliveryProofInput) {
    const order = await this.assertAssigned(riderId, orderId);
    if (!verifyDeliveryOtp(order.delivery_otp_hash, orderId, otp)) {
      throw AppError.unprocessable(
        'OTP_MISMATCH',
        'Incorrect OTP. Ask the customer for the 4-digit code in their app.',
      );
    }
    const proofPatch = await this.validateProof(
      riderId,
      orderId,
      proof,
      (await this.deliveryConfig()).proofPhotoRequired,
    );
    await this.workflow.run(async (tx) => {
      const actor = { type: 'rider' as const, id: riderId };
      await this.workflow.transition(tx, {
        orderId,
        to: 'DELIVERED',
        from: ['PICKED_UP'],
        actor,
        patch: {
          ...proofPatch,
          ...(order.payment_method === 'cod' ? { payment_status: 'captured' as const } : {}),
        },
      });
      await this.workflow.setDispatch(tx, {
        orderId,
        to: 'DONE',
        from: ['PICKED', 'AT_DROP'],
        actor,
      });
    });
    return this.orderView(riderId, orderId);
  }

  async undeliverable(
    riderId: string,
    orderId: string,
    reason: string,
    proof?: DeliveryProofInput,
  ) {
    const order = await this.assertAssigned(riderId, orderId);
    if (order.dispatch_status !== 'AT_DROP')
      throw AppError.conflict(
        'NOT_AT_DROP',
        'Mark yourself arrived at the customer location first',
      );
    const arrived = await this.db
      .selectFrom('order_events')
      .select('created_at')
      .where('order_id', '=', orderId)
      .where('event', '=', 'DISPATCH_AT_DROP')
      .orderBy('id', 'desc')
      .executeTakeFirst();
    if (arrived && Date.now() - arrived.created_at.getTime() < DOORSTEP_WAIT_MS) {
      const minutes = Math.ceil(
        (DOORSTEP_WAIT_MS - (Date.now() - arrived.created_at.getTime())) / 60_000,
      );
      throw AppError.conflict(
        'WAIT_AT_DOORSTEP',
        `Please wait ${minutes} more minute(s) and try calling the customer`,
      );
    }
    // a photo of the door is the rider's evidence that they actually reached the customer
    const proofPatch = await this.validateProof(
      riderId,
      orderId,
      proof,
      (await this.deliveryConfig()).proofPhotoRequired,
    );
    await this.workflow.run(async (tx) => {
      const actor = { type: 'rider' as const, id: riderId };
      await this.workflow.transition(tx, {
        orderId,
        to: 'UNDELIVERED',
        from: ['PICKED_UP'],
        actor,
        patch: { ...proofPatch, cancel_reason: reason, cancelled_by: 'rider' },
      });
      await this.workflow.setDispatch(tx, { orderId, to: 'DONE', actor });
    });
    return this.orderView(riderId, orderId);
  }

  deliveryConfig() {
    return this.config.get('delivery', { proofPhotoRequired: true });
  }

  /**
   * Doorstep photo (anti "food not delivered" fraud). The app uploads to Storage under the
   * rider's own folder (enforced by storage RLS); we check the path belongs to this trip and exists.
   */
  private async validateProof(
    riderId: string,
    orderId: string,
    proof: DeliveryProofInput | undefined,
    required: boolean,
  ) {
    if (!proof) {
      if (required)
        throw AppError.unprocessable(
          'PROOF_REQUIRED',
          'Take a photo of the package at the door to continue',
        );
      return {};
    }
    const expectedPrefix = `${riderId}/${orderId}/`;
    if (
      !proof.path.startsWith(expectedPrefix) ||
      !/^[\w-]+\.(jpe?g|png|webp)$/i.test(proof.path.slice(expectedPrefix.length))
    ) {
      throw AppError.badRequest('INVALID_PROOF', 'Delivery photo is not attached to this order');
    }
    if (!(await this.storage.exists('delivery-proofs', proof.path))) {
      throw AppError.unprocessable(
        'PROOF_NOT_UPLOADED',
        'The delivery photo has not finished uploading, please retry',
      );
    }
    return {
      delivery_proof_path: proof.path,
      delivery_proof_lat: proof.lat ?? null,
      delivery_proof_lng: proof.lng ?? null,
    };
  }

  async sos(riderId: string, input: SosDto) {
    const rider = await this.db
      .selectFrom('riders')
      .select('city_id')
      .where('id', '=', riderId)
      .executeTakeFirst();
    await this.audit.record(this.db, {
      actorId: riderId,
      action: 'rider.sos',
      entityType: 'rider',
      entityId: riderId,
      after: input,
    });
    if (rider?.city_id) {
      await this.realtime.publish({
        topic: topics.adminOps(rider.city_id),
        event: 'rider_sos',
        payload: { riderId, ...input, at: new Date().toISOString() },
      });
    }
  }

  private async assertAssigned(riderId: string, orderId: string) {
    const order = await this.db
      .selectFrom('orders')
      .selectAll()
      .where('id', '=', orderId)
      .executeTakeFirst();
    if (!order || order.rider_id !== riderId) throw AppError.notFound('Order');
    return order;
  }

  async orderView(riderId: string, orderId: string): Promise<RiderOrderDto> {
    const full = await this.reader.loadFull(orderId);
    if (full.order.rider_id !== riderId) throw AppError.notFound('Order');
    const { order } = full;
    const active = ACTIVE_ORDER_STATUSES.includes(order.status);
    const offer = await this.db
      .selectFrom('rider_offers')
      .select('payout_paise')
      .where('order_id', '=', orderId)
      .where('rider_id', '=', riderId)
      .where('status', '=', 'accepted')
      .executeTakeFirst();
    return {
      id: order.id,
      shortCode: order.short_code,
      status: order.status,
      dispatchStatus: order.dispatch_status,
      restaurant: {
        id: full.restaurant.id,
        name: full.restaurant.name,
        phone: active ? full.restaurant.phone : null,
        addressLine: full.restaurant.address_line,
        lat: full.restaurant.lat,
        lng: full.restaurant.lng,
      },
      customer: { name: order.delivery_address.contactName },
      dropAddress: order.delivery_address,
      items: full.items.map((i) => ({
        name: i.name,
        variantName: i.variant_name,
        quantity: i.quantity,
      })),
      paymentMethod: order.payment_method,
      collectPaise: order.payment_method === 'cod' ? order.total_paise : 0,
      payoutPaise: (offer?.payout_paise ?? 0) + order.tip_paise,
      customerNote: order.customer_note,
      proofPhotoRequired: (await this.deliveryConfig()).proofPhotoRequired,
      readyAt: iso(order.ready_at),
      estimatedDeliveryAt: iso(order.estimated_delivery_at),
      createdAt: order.created_at.toISOString(),
      deliveredAt: iso(order.delivered_at),
    };
  }
}
