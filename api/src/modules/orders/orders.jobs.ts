import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { sql } from 'kysely';
import { DB, type Db } from '../../infra/database/database';
import { JobRegistry } from '../../infra/jobs/jobs';
import { KV_STORE, type KvStore } from '../../infra/kv/kv-store';
import { ORDER_TIMEOUTS, OrderWorkflow, SYSTEM } from './order-workflow.service';

/** Restaurants that miss this many orders in a row are paused automatically. */
const MISSED_ORDERS_PAUSE_THRESHOLD = 3;
const AUTO_PAUSE_MINUTES = 30;

@Injectable()
export class OrdersJobs implements OnModuleInit {
  private readonly logger = new Logger(OrdersJobs.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KV_STORE) private readonly kv: KvStore,
    private readonly registry: JobRegistry,
    private readonly workflow: OrderWorkflow,
  ) {}

  onModuleInit() {
    this.registry.register('order.accept-timeout', (p) => this.acceptTimeout(p.orderId as string));
    this.registry.register('order.payment-expiry', (p) => this.paymentExpiry(p.orderId as string));
  }

  /** Restaurant ignored the order: cancel + refund, and pause the restaurant if it keeps happening. */
  async acceptTimeout(orderId: string) {
    await this.workflow.run(async (tx) => {
      const order = await this.workflow.lock(tx, orderId);
      if (order.status !== 'PLACED') return;
      await this.workflow.transition(tx, {
        orderId,
        to: 'CANCELLED',
        actor: SYSTEM,
        patch: {
          cancel_reason: 'The restaurant could not confirm your order in time',
          cancelled_by: 'system',
        },
      });
      const r = await tx
        .updateTable('restaurants')
        .set({ missed_orders_count: sql`missed_orders_count + 1` })
        .where('id', '=', order.restaurant_id)
        .returning(['missed_orders_count'])
        .executeTakeFirstOrThrow();
      if (r.missed_orders_count >= MISSED_ORDERS_PAUSE_THRESHOLD) {
        await tx
          .updateTable('restaurants')
          .set({
            busy_until: new Date(Date.now() + AUTO_PAUSE_MINUTES * 60_000),
            missed_orders_count: 0,
          })
          .where('id', '=', order.restaurant_id)
          .execute();
        this.logger.warn(
          `restaurant ${order.restaurant_id} auto-paused after ${r.missed_orders_count} missed orders`,
        );
      }
    });
  }

  async paymentExpiry(orderId: string) {
    await this.workflow.run(async (tx) => {
      const order = await this.workflow.lock(tx, orderId);
      if (order.status !== 'PAYMENT_PENDING') return;
      await this.workflow.transition(tx, {
        orderId,
        to: 'PAYMENT_FAILED',
        actor: SYSTEM,
        patch: { payment_status: 'failed', cancel_reason: 'Payment not completed in time' },
      });
    });
  }

  /**
   * Safety net for lost timers (in-process scheduler restarts, QStash outages):
   * anything past its deadline is processed here. Handlers are idempotent.
   */
  @Interval(60_000)
  async watchdog() {
    if (
      !(await this.kv
        .set('watchdog:orders', 1, { ttlSeconds: 55, onlyIfAbsent: true })
        .catch(() => false))
    )
      return;
    const grace = 60_000;
    const [unaccepted, unpaid] = await Promise.all([
      this.db
        .selectFrom('orders')
        .select('id')
        .where('status', '=', 'PLACED')
        .where(
          'placed_at',
          '<',
          new Date(Date.now() - ORDER_TIMEOUTS.restaurantAcceptSeconds * 1000 - grace),
        )
        .limit(100)
        .execute(),
      this.db
        .selectFrom('orders')
        .select('id')
        .where('status', '=', 'PAYMENT_PENDING')
        .where(
          'created_at',
          '<',
          new Date(Date.now() - ORDER_TIMEOUTS.paymentSeconds * 1000 - grace),
        )
        .limit(100)
        .execute(),
    ]);
    for (const { id } of unaccepted)
      await this.acceptTimeout(id).catch((e) =>
        this.logger.error(`watchdog accept ${id}: ${e.message}`),
      );
    for (const { id } of unpaid)
      await this.paymentExpiry(id).catch((e) =>
        this.logger.error(`watchdog payment ${id}: ${e.message}`),
      );
  }
}
