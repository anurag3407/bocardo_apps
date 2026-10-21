import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { AppError } from '../../common/errors/app-error';
import { iso } from '../../common/http/schemas';
import { DB, type Db } from '../../infra/database/database';
import { ACTIVE_ORDER_STATUSES } from '../orders/domain/order-state-machine';
import { OrderReader, toLines } from '../orders/order-reader.service';
import { ORDER_TIMEOUTS, OrderWorkflow } from '../orders/order-workflow.service';
import type { PartnerOrderDto, RejectOrderDto } from './partner.dto';

const REJECT_MESSAGES: Record<RejectOrderDto['reason'], string> = {
  ITEMS_UNAVAILABLE: 'Some items are unavailable at the restaurant',
  TOO_BUSY: 'The restaurant is too busy to take your order',
  CLOSING_SOON: 'The restaurant is closing',
  OTHER: 'The restaurant could not accept your order',
};

/** Restaurant-side order lifecycle: accept → (extend) → ready, or reject/cancel. */
@Injectable()
export class PartnerOrdersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly workflow: OrderWorkflow,
    private readonly reader: OrderReader,
  ) {}

  async list(
    restaurantId: string,
    scope: 'active' | 'history',
    cursor: string | undefined,
    limit: number,
  ) {
    let q = this.db
      .selectFrom('orders')
      .select(['id', 'created_at'])
      .where('restaurant_id', '=', restaurantId)
      .limit(limit + 1);
    q =
      scope === 'active'
        ? q
            .where(
              'status',
              'in',
              ACTIVE_ORDER_STATUSES.filter((s) => s !== 'PAYMENT_PENDING'),
            )
            .orderBy('created_at', 'asc')
        : q.where('status', 'not in', [...ACTIVE_ORDER_STATUSES]).orderBy('created_at', 'desc');
    if (cursor) q = q.where('created_at', scope === 'active' ? '>' : '<', new Date(cursor));
    const rows = await q.execute();
    const page = rows.slice(0, limit);
    return {
      items: await Promise.all(page.map((r) => this.view(restaurantId, r.id))),
      nextCursor: rows.length > limit ? page[page.length - 1].created_at.toISOString() : null,
    };
  }

  async accept(restaurantId: string, userId: string, orderId: string, prepMinutes: number) {
    await this.assertOwned(restaurantId, orderId);
    await this.workflow.run(async (tx) => {
      const order = await this.workflow.lock(tx, orderId);
      const travelSeconds = Math.round((order.distance_m / 5) * 1.0);
      await this.workflow.transition(tx, {
        orderId,
        to: 'ACCEPTED',
        from: ['PLACED'],
        actor: { type: 'restaurant', id: userId },
        patch: {
          prep_minutes: prepMinutes,
          estimated_delivery_at: new Date(
            Date.now() + (prepMinutes * 60 + travelSeconds + 300) * 1000,
          ),
        },
        metadata: { prepMinutes },
      });
      await tx
        .updateTable('restaurants')
        .set({ missed_orders_count: 0 })
        .where('id', '=', restaurantId)
        .execute();
    });
    return this.view(restaurantId, orderId);
  }

  async reject(restaurantId: string, userId: string, orderId: string, input: RejectOrderDto) {
    await this.assertOwned(restaurantId, orderId);
    await this.workflow.run((tx) =>
      this.workflow.transition(tx, {
        orderId,
        to: 'REJECTED',
        from: ['PLACED'],
        actor: { type: 'restaurant', id: userId },
        patch: { cancel_reason: REJECT_MESSAGES[input.reason], cancelled_by: 'restaurant' },
        metadata: { reason: input.reason, note: input.note ?? null },
      }),
    );
    return this.view(restaurantId, orderId);
  }

  async markReady(restaurantId: string, userId: string, orderId: string) {
    await this.assertOwned(restaurantId, orderId);
    await this.workflow.run((tx) =>
      this.workflow.transition(tx, {
        orderId,
        to: 'READY',
        from: ['ACCEPTED'],
        actor: { type: 'restaurant', id: userId },
      }),
    );
    return this.view(restaurantId, orderId);
  }

  /** Kitchen is running late: push the ETA (and the rider's arrival) back. */
  async extendPrep(restaurantId: string, userId: string, orderId: string, extraMinutes: number) {
    await this.assertOwned(restaurantId, orderId);
    await this.workflow.run(async (tx) => {
      const order = await this.workflow.lock(tx, orderId);
      if (order.status !== 'ACCEPTED')
        throw AppError.conflict(
          'ORDER_STATE_CHANGED',
          'Only orders being prepared can be extended',
        );
      if ((order.prep_minutes ?? 0) + extraMinutes > 120)
        throw AppError.unprocessable(
          'PREP_TOO_LONG',
          'Total preparation time cannot exceed 2 hours',
        );
      await tx
        .updateTable('orders')
        .set({
          prep_minutes: sql`coalesce(prep_minutes, 0) + ${extraMinutes}`,
          estimated_delivery_at: sql`coalesce(estimated_delivery_at, now()) + make_interval(mins => ${extraMinutes})`,
          version: sql`version + 1`,
        })
        .where('id', '=', orderId)
        .execute();
      await this.workflow.recordEvent(
        tx,
        orderId,
        'PREP_EXTENDED',
        { type: 'restaurant', id: userId },
        { extraMinutes },
      );
    });
    return this.view(restaurantId, orderId);
  }

  /** After accepting (e.g. an ingredient ran out). Refund + coupon release follow automatically. */
  async cancel(restaurantId: string, userId: string, orderId: string, reason: string) {
    await this.assertOwned(restaurantId, orderId);
    await this.workflow.run((tx) =>
      this.workflow.transition(tx, {
        orderId,
        to: 'CANCELLED',
        from: ['ACCEPTED', 'READY'],
        actor: { type: 'restaurant', id: userId },
        patch: { cancel_reason: `Cancelled by restaurant: ${reason}`, cancelled_by: 'restaurant' },
      }),
    );
    return this.view(restaurantId, orderId);
  }

  async view(restaurantId: string, orderId: string): Promise<PartnerOrderDto> {
    const full = await this.reader.loadFull(orderId);
    if (full.order.restaurant_id !== restaurantId) throw AppError.notFound('Order');
    const { order } = full;
    const active = ACTIVE_ORDER_STATUSES.includes(order.status);
    return {
      id: order.id,
      shortCode: order.short_code,
      status: order.status,
      dispatchStatus: order.dispatch_status,
      // privacy: restaurants only see the first name
      customerName: (full.customer.full_name ?? 'Customer').split(' ')[0],
      items: toLines(full.items),
      customerNote: order.customer_note,
      itemTotalPaise: order.item_total_paise,
      totalPaise: order.total_paise,
      paymentMethod: order.payment_method,
      prepMinutes: order.prep_minutes,
      acceptBy:
        order.status === 'PLACED' && order.placed_at
          ? new Date(
              order.placed_at.getTime() + ORDER_TIMEOUTS.restaurantAcceptSeconds * 1000,
            ).toISOString()
          : null,
      rider: full.rider
        ? {
            name: full.rider.full_name,
            phone: active ? full.rider.phone : null,
            vehicleNumber: full.rider.vehicle_number,
          }
        : null,
      placedAt: iso(order.placed_at),
      acceptedAt: iso(order.accepted_at),
      readyAt: iso(order.ready_at),
      pickedUpAt: iso(order.picked_up_at),
      cancelReason: order.cancel_reason,
      createdAt: order.created_at.toISOString(),
    };
  }

  private async assertOwned(restaurantId: string, orderId: string) {
    const order = await this.db
      .selectFrom('orders')
      .select('restaurant_id')
      .where('id', '=', orderId)
      .executeTakeFirst();
    if (!order || order.restaurant_id !== restaurantId) throw AppError.notFound('Order');
  }
}
