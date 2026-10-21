import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { AppError } from '../../common/errors/app-error';
import { DB, json, type Db, type Tx } from '../../infra/database/database';
import type {
  ActorType,
  DispatchStatus,
  Order,
  OrderStatus,
  OrderUpdate,
} from '../../infra/database/db.types';
import { OutboxProcessor } from '../../platform/outbox/outbox.processor';
import { OutboxService } from '../../platform/outbox/outbox.service';
import {
  assertDispatchTransition,
  assertTransition,
  STATUS_TIMESTAMP,
} from './domain/order-state-machine';

export interface Actor {
  type: ActorType;
  id: string | null;
}

export const SYSTEM: Actor = { type: 'system', id: null };

export const ORDER_TIMEOUTS = {
  /** Unpaid online orders are released after this. */
  paymentSeconds: 15 * 60,
  /** Restaurants must accept within this, or the order auto-cancels. */
  restaurantAcceptSeconds: 3 * 60,
  /** Start looking for a rider this long before the food is expected to be ready. */
  dispatchLeadSeconds: 10 * 60,
} as const;

/**
 * The only code path that changes `orders.status` / `orders.dispatch_status`.
 * Each transition: row lock → legality check → update + version bump → event row →
 * outbox message, all in the caller's transaction.
 */
@Injectable()
export class OrderWorkflow {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly outbox: OutboxService,
    private readonly processor: OutboxProcessor,
  ) {}

  /** Runs `fn` in a transaction, then nudges the outbox so side effects go out immediately. */
  async run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const result = await this.db.transaction().execute(fn);
    this.processor.poke();
    return result;
  }

  async lock(tx: Tx, orderId: string): Promise<Order> {
    const order = await tx
      .selectFrom('orders')
      .selectAll()
      .where('id', '=', orderId)
      .forUpdate()
      .executeTakeFirst();
    if (!order) throw AppError.notFound('Order');
    return order;
  }

  async transition(
    tx: Tx,
    input: {
      orderId: string;
      to: OrderStatus;
      actor: Actor;
      from?: OrderStatus[];
      patch?: OrderUpdate;
      metadata?: Record<string, unknown>;
    },
  ): Promise<Order> {
    const order = await this.lock(tx, input.orderId);
    if (input.from && !input.from.includes(order.status)) {
      throw AppError.conflict(
        'ORDER_STATE_CHANGED',
        `Order is ${order.status.toLowerCase().replace('_', ' ')}`,
        { status: order.status },
      );
    }
    assertTransition(order.status, input.to);

    const stamp = STATUS_TIMESTAMP[input.to];
    const updated = await tx
      .updateTable('orders')
      .set({
        ...input.patch,
        status: input.to,
        version: sql`version + 1`,
        ...(stamp ? { [stamp]: new Date() } : {}),
      })
      .where('id', '=', order.id)
      .where('version', '=', order.version)
      .returningAll()
      .executeTakeFirst();
    if (!updated)
      throw AppError.conflict(
        'ORDER_STATE_CHANGED',
        'Order was updated concurrently, please retry',
      );

    await this.recordEvent(
      tx,
      order.id,
      `STATUS_${input.to}`,
      input.actor,
      input.metadata ?? {},
      order.status,
      input.to,
    );
    await this.outbox.enqueue(tx, 'order.status_changed', {
      orderId: order.id,
      from: order.status,
      to: input.to,
      actorType: input.actor.type,
    });
    await this.scheduleFollowUps(tx, updated);
    return updated;
  }

  async setDispatch(
    tx: Tx,
    input: {
      orderId: string;
      to: DispatchStatus;
      actor: Actor;
      from?: DispatchStatus[];
      patch?: OrderUpdate;
      metadata?: Record<string, unknown>;
    },
  ): Promise<Order> {
    const order = await this.lock(tx, input.orderId);
    if (input.from && !input.from.includes(order.dispatch_status)) {
      throw AppError.conflict(
        'DISPATCH_STATE_CHANGED',
        `Delivery is already ${order.dispatch_status.toLowerCase()}`,
        { dispatchStatus: order.dispatch_status },
      );
    }
    if (order.dispatch_status !== input.to)
      assertDispatchTransition(order.dispatch_status, input.to);

    const updated = await tx
      .updateTable('orders')
      .set({ ...input.patch, dispatch_status: input.to, version: sql`version + 1` })
      .where('id', '=', order.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await this.recordEvent(tx, order.id, `DISPATCH_${input.to}`, input.actor, input.metadata ?? {});
    await this.outbox.enqueue(tx, 'order.dispatch_changed', {
      orderId: order.id,
      from: order.dispatch_status,
      to: input.to,
    });
    return updated;
  }

  async recordEvent(
    tx: Tx,
    orderId: string,
    event: string,
    actor: Actor,
    metadata: Record<string, unknown> = {},
    from: OrderStatus | null = null,
    to: OrderStatus | null = null,
  ) {
    await tx
      .insertInto('order_events')
      .values({
        order_id: orderId,
        event,
        from_status: from,
        to_status: to,
        actor_type: actor.type,
        actor_id: actor.id,
        metadata: json(metadata),
      })
      .execute();
  }

  /** Timers that must start the moment a status is entered. */
  private async scheduleFollowUps(tx: Tx, order: Order) {
    if (order.status === 'PLACED') {
      await this.outbox.enqueue(tx, 'job.schedule', {
        name: 'order.accept-timeout',
        payload: { orderId: order.id },
        delaySeconds: ORDER_TIMEOUTS.restaurantAcceptSeconds,
        dedupeId: `accept-timeout-${order.id}`,
      });
    }
    if (order.status === 'ACCEPTED') {
      const prepSeconds = (order.prep_minutes ?? 15) * 60;
      await this.outbox.enqueue(
        tx,
        'dispatch.start',
        { orderId: order.id },
        Math.max(0, prepSeconds - ORDER_TIMEOUTS.dispatchLeadSeconds),
      );
    }
  }
}
