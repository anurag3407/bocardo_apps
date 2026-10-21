import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { AppError } from '../../common/errors/app-error';
import { iso } from '../../common/http/schemas';
import { DB, type Db } from '../../infra/database/database';
import type { OrderStatus } from '../../infra/database/db.types';
import { AuditService } from '../../platform/audit/audit.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { RiderPool } from '../dispatch/rider-pool.service';
import { ACTIVE_ORDER_STATUSES } from '../orders/domain/order-state-machine';
import { OrderReader } from '../orders/order-reader.service';
import { OrderWorkflow } from '../orders/order-workflow.service';
import { RefundsService } from '../payments/refunds.service';
import type {
  AdminOrderDetailDto,
  AdminOrderPageDto,
  AdminOrdersQueryDto,
  LiveMapDto,
  OverviewDto,
} from './admin.dto';

const startOfTodayIst = () => {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3600_000);
};

@Injectable()
export class AdminOpsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly reader: OrderReader,
    private readonly workflow: OrderWorkflow,
    private readonly dispatch: DispatchService,
    private readonly pool: RiderPool,
    private readonly refunds: RefundsService,
    private readonly audit: AuditService,
  ) {}

  async overview(cityId?: string): Promise<OverviewDto> {
    const today = startOfTodayIst();
    const [active, todayStats, riders, restaurants, tickets, otp] = await Promise.all([
      this.db
        .selectFrom('orders')
        .select(['status', (eb) => eb.fn.countAll<number>().as('n')])
        .where('status', 'in', ACTIVE_ORDER_STATUSES)
        .$if(!!cityId, (q) => q.where('city_id', '=', cityId!))
        .groupBy('status')
        .execute(),
      this.db
        .selectFrom('orders')
        .select([
          (eb) => eb.fn.countAll<number>().as('orders'),
          sql<number>`count(*) filter (where status = 'DELIVERED')`.as('delivered'),
          sql<number>`count(*) filter (where status in ('CANCELLED', 'REJECTED'))`.as('cancelled'),
          sql<number>`coalesce(sum(total_paise) filter (where status = 'DELIVERED'), 0)`.as('gmv'),
          sql<
            number | null
          >`avg(extract(epoch from (delivered_at - placed_at)) / 60) filter (where status = 'DELIVERED')`.as(
            'avg_minutes',
          ),
          sql<number>`count(*) filter (where dispatch_status = 'FAILED' and status in ('ACCEPTED', 'READY'))`.as(
            'dispatch_failed',
          ),
        ])
        .where('created_at', '>=', today)
        .$if(!!cityId, (q) => q.where('city_id', '=', cityId!))
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('riders')
        .select([
          sql<number>`count(*) filter (where is_online)`.as('online'),
          sql<number>`count(*) filter (where is_online and current_order_id is not null)`.as(
            'busy',
          ),
          sql<number>`count(*) filter (where kyc_status = 'pending')`.as('pending'),
        ])
        .$if(!!cityId, (q) => q.where('city_id', '=', cityId!))
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('restaurants')
        .select([
          sql<number>`count(*) filter (where status = 'active' and is_open and (busy_until is null or busy_until < now()))`.as(
            'open',
          ),
          sql<number>`count(*) filter (where status = 'pending')`.as('pending'),
        ])
        .$if(!!cityId, (q) => q.where('city_id', '=', cityId!))
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('support_tickets')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('status', 'in', ['open', 'in_progress'])
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('otp_send_log')
        .select([
          sql<number>`count(*) filter (where outcome = 'sent')`.as('sent'),
          sql<number>`count(*) filter (where outcome = 'blocked_no_ticket')`.as('blocked'),
        ])
        .where('created_at', '>', new Date(Date.now() - 3_600_000))
        .executeTakeFirstOrThrow(),
    ]);

    return {
      activeByStatus: Object.fromEntries(active.map((r) => [r.status, Number(r.n)])),
      ordersToday: Number(todayStats.orders),
      deliveredToday: Number(todayStats.delivered),
      cancelledToday: Number(todayStats.cancelled),
      gmvTodayPaise: Number(todayStats.gmv),
      avgDeliveryMinutesToday:
        todayStats.avg_minutes === null
          ? null
          : Math.round(Number(todayStats.avg_minutes) * 10) / 10,
      ridersOnline: Number(riders.online),
      ridersBusy: Number(riders.busy),
      restaurantsOpen: Number(restaurants.open),
      dispatchFailed: Number(todayStats.dispatch_failed),
      pendingRestaurants: Number(restaurants.pending),
      pendingRiders: Number(riders.pending),
      openTickets: Number(tickets.n),
      otpSentLastHour: Number(otp.sent),
      otpBlockedLastHour: Number(otp.blocked),
    };
  }

  async liveMap(cityId?: string): Promise<LiveMapDto> {
    let ordersQ = this.db
      .selectFrom('orders')
      .select([
        'id',
        'short_code',
        'status',
        'dispatch_status',
        'pickup_lat',
        'pickup_lng',
        'drop_lat',
        'drop_lng',
        'rider_id',
        'created_at',
      ])
      .where(
        'status',
        'in',
        ACTIVE_ORDER_STATUSES.filter((s) => s !== 'PAYMENT_PENDING'),
      )
      .limit(1000);
    let ridersQ = this.db
      .selectFrom('riders as r')
      .innerJoin('profiles as p', 'p.id', 'r.id')
      .select([
        'r.id',
        'p.full_name',
        'r.last_lat',
        'r.last_lng',
        'r.current_order_id',
        'r.last_seen_at',
      ])
      .where('r.is_online', '=', true)
      .limit(2000);
    if (cityId) {
      ordersQ = ordersQ.where('city_id', '=', cityId);
      ridersQ = ridersQ.where('r.city_id', '=', cityId);
    }
    const [orders, riders] = await Promise.all([ordersQ.execute(), ridersQ.execute()]);
    const live = await Promise.all(riders.map((r) => this.pool.location(r.id).catch(() => null)));

    return {
      orders: orders.map((o) => ({
        id: o.id,
        shortCode: o.short_code,
        status: o.status,
        dispatchStatus: o.dispatch_status,
        pickup: { lat: o.pickup_lat, lng: o.pickup_lng },
        drop: { lat: o.drop_lat, lng: o.drop_lng },
        riderId: o.rider_id,
        createdAt: o.created_at.toISOString(),
      })),
      riders: riders
        .map((r, i) => ({
          id: r.id,
          name: r.full_name,
          lat: live[i]?.lat ?? r.last_lat,
          lng: live[i]?.lng ?? r.last_lng,
          busy: r.current_order_id !== null,
          lastSeenAt: live[i]?.at ?? iso(r.last_seen_at),
        }))
        .filter(
          (r): r is typeof r & { lat: number; lng: number } => r.lat !== null && r.lng !== null,
        ),
    };
  }

  async listOrders(q: AdminOrdersQueryDto): Promise<AdminOrderPageDto> {
    let query = this.db
      .selectFrom('orders as o')
      .innerJoin('restaurants as r', 'r.id', 'o.restaurant_id')
      .innerJoin('profiles as c', 'c.id', 'o.customer_id')
      .leftJoin('profiles as rp', 'rp.id', 'o.rider_id')
      .select([
        'o.id',
        'o.short_code',
        'o.status',
        'o.dispatch_status',
        'o.total_paise',
        'o.payment_method',
        'o.created_at',
        'o.delivered_at',
        'r.id as restaurant_id',
        'r.name as restaurant_name',
        'r.logo_url',
        'c.full_name as customer_name',
        'c.phone as customer_phone',
        'rp.full_name as rider_name',
        sql<number>`(select coalesce(sum(quantity), 0) from order_items i where i.order_id = o.id)`.as(
          'item_count',
        ),
        sql<string>`(select string_agg(i.quantity || ' × ' || i.name, ', ') from order_items i where i.order_id = o.id)`.as(
          'items_preview',
        ),
      ])
      .orderBy('o.created_at', 'desc')
      .limit(q.limit + 1);

    const statusFilter: Record<AdminOrdersQueryDto['status'], OrderStatus[] | null> = {
      active: [...ACTIVE_ORDER_STATUSES],
      all: null,
      delivered: ['DELIVERED'],
      cancelled: ['CANCELLED', 'REJECTED', 'PAYMENT_FAILED', 'UNDELIVERED'],
      failed_dispatch: ['ACCEPTED', 'READY'],
    };
    const statuses = statusFilter[q.status];
    if (statuses) query = query.where('o.status', 'in', statuses);
    if (q.status === 'failed_dispatch') query = query.where('o.dispatch_status', '=', 'FAILED');
    if (q.restaurantId) query = query.where('o.restaurant_id', '=', q.restaurantId);
    if (q.riderId) query = query.where('o.rider_id', '=', q.riderId);
    if (q.cityId) query = query.where('o.city_id', '=', q.cityId);
    if (q.q) {
      const term = q.q.toUpperCase();
      query = query.where((eb) =>
        eb.or([
          eb('o.short_code', '=', term),
          eb('c.phone', 'like', `%${q.q!.replace(/\D/g, '')}%`),
        ]),
      );
    }
    if (q.cursor) query = query.where('o.created_at', '<', new Date(q.cursor));

    const rows = await query.execute();
    const page = rows.slice(0, q.limit);
    return {
      items: page.map((r) => ({
        id: r.id,
        shortCode: r.short_code,
        status: r.status,
        dispatchStatus: r.dispatch_status,
        restaurant: { id: r.restaurant_id, name: r.restaurant_name, logoUrl: r.logo_url },
        itemCount: Number(r.item_count),
        itemsPreview: r.items_preview ?? '',
        totalPaise: r.total_paise,
        paymentMethod: r.payment_method,
        createdAt: r.created_at.toISOString(),
        deliveredAt: iso(r.delivered_at),
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        riderName: r.rider_name,
      })),
      nextCursor: rows.length > q.limit ? page[page.length - 1].created_at.toISOString() : null,
    };
  }

  async orderDetail(orderId: string): Promise<AdminOrderDetailDto> {
    const full = await this.reader.loadFull(orderId);
    const base = await this.reader.customerView(orderId, full.order.customer_id);
    const [payments, refunds, offers, calls] = await Promise.all([
      this.db
        .selectFrom('payments')
        .selectAll()
        .where('order_id', '=', orderId)
        .orderBy('created_at')
        .execute(),
      this.db
        .selectFrom('refunds')
        .selectAll()
        .where('order_id', '=', orderId)
        .orderBy('created_at')
        .execute(),
      this.db
        .selectFrom('rider_offers as f')
        .leftJoin('profiles as p', 'p.id', 'f.rider_id')
        .select([
          'f.id',
          'f.rider_id',
          'p.full_name',
          'f.status',
          'f.score',
          'f.distance_m',
          'f.payout_paise',
          'f.created_at',
        ])
        .where('f.order_id', '=', orderId)
        .orderBy('f.created_at')
        .execute(),
      this.db
        .selectFrom('call_logs')
        .selectAll()
        .where('order_id', '=', orderId)
        .orderBy('created_at')
        .execute(),
    ]);
    return {
      ...base,
      deliveryOtp: null,
      deliveryProofLat: full.order.delivery_proof_lat,
      deliveryProofLng: full.order.delivery_proof_lng,
      calls: calls.map((c) => ({
        id: c.id,
        callerRole: c.caller_role,
        calleeRole: c.callee_role,
        provider: c.provider,
        status: c.status,
        durationSeconds: c.duration_seconds,
        createdAt: c.created_at.toISOString(),
      })),
      customer: { id: full.customer.id, name: full.customer.full_name, phone: full.customer.phone },
      events: full.events.map((e) => ({
        id: e.id,
        event: e.event,
        actorType: e.actor_type,
        actorId: e.actor_id,
        metadata: e.metadata,
        at: e.created_at.toISOString(),
      })),
      payments: payments.map((p) => ({
        id: p.id,
        provider: p.provider,
        providerOrderId: p.provider_order_id,
        providerPaymentId: p.provider_payment_id,
        amountPaise: p.amount_paise,
        refundedPaise: p.refunded_paise,
        status: p.status,
        createdAt: p.created_at.toISOString(),
      })),
      refunds: refunds.map((r) => ({
        id: r.id,
        amountPaise: r.amount_paise,
        status: r.status,
        reason: r.reason,
        attempts: r.attempts,
        lastError: r.last_error,
        createdAt: r.created_at.toISOString(),
      })),
      offers: offers.map((f) => ({
        id: f.id,
        riderId: f.rider_id,
        riderName: f.full_name,
        status: f.status,
        score: f.score,
        distanceM: f.distance_m,
        payoutPaise: f.payout_paise,
        createdAt: f.created_at.toISOString(),
      })),
    };
  }

  /** Ops can cancel any order that has not been picked up; refunds follow automatically. */
  async cancelOrder(orderId: string, actorId: string, reason: string) {
    await this.workflow.run(async (tx) => {
      const before = await this.workflow.lock(tx, orderId);
      await this.workflow.transition(tx, {
        orderId,
        to: 'CANCELLED',
        from: ['PAYMENT_PENDING', 'PLACED', 'ACCEPTED', 'READY'],
        actor: { type: 'admin', id: actorId },
        patch: { cancel_reason: reason, cancelled_by: 'admin' },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'order.cancel',
        entityType: 'order',
        entityId: orderId,
        before: { status: before.status },
        after: { reason },
      });
    });
    return this.orderDetail(orderId);
  }

  async refund(orderId: string, actorId: string, amountPaise: number, reason: string) {
    await this.workflow.run(async (tx) => {
      await this.refunds.create(tx, { orderId, amountPaise, reason: `admin: ${reason}` });
      await this.audit.record(tx, {
        actorId,
        action: 'order.refund',
        entityType: 'order',
        entityId: orderId,
        after: { amountPaise, reason },
      });
    });
    return this.orderDetail(orderId);
  }

  async reassign(orderId: string, actorId: string, reason: string) {
    const order = await this.db
      .selectFrom('orders')
      .select('id')
      .where('id', '=', orderId)
      .executeTakeFirst();
    if (!order) throw AppError.notFound('Order');
    await this.dispatch.reassign(orderId, { type: 'admin', id: actorId }, reason);
    await this.audit.record(this.db, {
      actorId,
      action: 'order.reassign',
      entityType: 'order',
      entityId: orderId,
      after: { reason },
    });
    return this.orderDetail(orderId);
  }
}
