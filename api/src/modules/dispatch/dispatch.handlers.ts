import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DB, type Db } from '../../infra/database/database';
import type { OrderStatus } from '../../infra/database/db.types';
import { JobRegistry } from '../../infra/jobs/jobs';
import { KV_STORE, type KvStore } from '../../infra/kv/kv-store';
import { RealtimePublisher, topics } from '../../infra/realtime/realtime-publisher';
import { OutboxRegistry } from '../../platform/outbox/outbox.registry';
import { TERMINAL_ORDER_STATUSES } from '../orders/domain/order-state-machine';
import { SYSTEM } from '../orders/order-workflow.service';
import { DispatchService } from './dispatch.service';
import { RiderPool } from './rider-pool.service';

const STALE_ALERT_MS = 3 * 60 * 1000;
const STALE_REASSIGN_MS = 6 * 60 * 1000;
const AUTO_OFFLINE_MS = 15 * 60 * 1000;

/** Wires dispatch into events/jobs, and runs watchdogs that heal lost jobs and stuck riders. */
@Injectable()
export class DispatchHandlers implements OnModuleInit {
  private readonly logger = new Logger(DispatchHandlers.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KV_STORE) private readonly kv: KvStore,
    private readonly dispatch: DispatchService,
    private readonly pool: RiderPool,
    private readonly outbox: OutboxRegistry,
    private readonly jobs: JobRegistry,
    private readonly realtime: RealtimePublisher,
  ) {}

  onModuleInit() {
    this.outbox.on('dispatch.start', (p) => this.dispatch.start(p.orderId as string));
    this.outbox.on('order.status_changed', async (p) => {
      if (TERMINAL_ORDER_STATUSES.includes(p.to as OrderStatus))
        await this.dispatch.onOrderClosed(p.orderId as string);
    });
    this.jobs.register('dispatch.retry', (p) => this.dispatch.start(p.orderId as string));
    this.jobs.register('dispatch.offer-timeout', (p) =>
      this.dispatch.expireOffer(p.offerId as string),
    );
  }

  /** Re-kicks orders whose retry job was lost (e.g. in-process timers after a restart). */
  @Interval(60_000)
  async healStuckSearches() {
    if (!(await this.acquire('watchdog:dispatch', 55))) return;
    const stuck = await this.db
      .selectFrom('orders as o')
      .select('o.id')
      .where('o.dispatch_status', '=', 'SEARCHING')
      .where('o.rider_id', 'is', null)
      .where('o.status', 'in', ['ACCEPTED', 'READY'])
      .where('o.updated_at', '<', new Date(Date.now() - 90_000))
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('rider_offers as f')
              .select('f.id')
              .whereRef('f.order_id', '=', 'o.id')
              .where('f.status', '=', 'pending')
              .where('f.expires_at', '>', new Date()),
          ),
        ),
      )
      .limit(100)
      .execute();
    for (const { id } of stuck)
      await this.dispatch.start(id).catch((e) => this.logger.error(`heal ${id}: ${e.message}`));
  }

  /** Riders who stopped sending location mid-delivery: alert ops, then reassign before pickup. */
  @Interval(60_000)
  async sweepStaleRiders() {
    if (!(await this.acquire('watchdog:riders', 55))) return;
    const now = Date.now();
    const busy = await this.db
      .selectFrom('riders as r')
      .innerJoin('orders as o', 'o.id', 'r.current_order_id')
      .select([
        'r.id as rider_id',
        'r.last_seen_at',
        'o.id as order_id',
        'o.short_code',
        'o.dispatch_status',
        'o.city_id',
      ])
      .where('r.last_seen_at', '<', new Date(now - STALE_ALERT_MS))
      .execute();

    for (const row of busy) {
      const staleMs = now - (row.last_seen_at?.getTime() ?? 0);
      const pickedUp = row.dispatch_status === 'PICKED' || row.dispatch_status === 'AT_DROP';
      if (!pickedUp && staleMs > STALE_REASSIGN_MS) {
        this.logger.warn(
          `reassigning ${row.short_code}: rider ${row.rider_id} silent for ${Math.round(staleMs / 1000)}s`,
        );
        await this.dispatch
          .reassign(row.order_id, SYSTEM, 'rider unreachable')
          .catch((e) => this.logger.error(e.message));
        continue;
      }
      if (
        await this.kv.set(`alerted:stale:${row.order_id}`, 1, {
          ttlSeconds: 600,
          onlyIfAbsent: true,
        })
      ) {
        await this.realtime
          .publish({
            topic: topics.adminOps(row.city_id),
            event: 'rider_stale',
            payload: {
              orderId: row.order_id,
              riderId: row.rider_id,
              shortCode: row.short_code,
              pickedUp,
            },
          })
          .catch(() => undefined);
      }
    }

    const idle = await this.db
      .updateTable('riders')
      .set({ is_online: false })
      .where('is_online', '=', true)
      .where('current_order_id', 'is', null)
      .where('last_seen_at', '<', new Date(now - AUTO_OFFLINE_MS))
      .returning(['id', 'city_id'])
      .execute();
    for (const r of idle)
      if (r.city_id) await this.pool.goOffline(r.id, r.city_id).catch(() => undefined);
  }

  private acquire(key: string, ttlSeconds: number) {
    return this.kv.set(key, 1, { ttlSeconds, onlyIfAbsent: true }).catch(() => false);
  }
}
