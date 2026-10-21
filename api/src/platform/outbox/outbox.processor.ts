import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { JOB_SCHEDULER, type JobName, type JobScheduler } from '../../infra/jobs/jobs';
import { RealtimePublisher, type RealtimeMessage } from '../../infra/realtime/realtime-publisher';
import type { ClientApp } from '../../infra/database/db.types';
import type { PushMessage } from '../../infra/push/push-sender';
import { NotificationsService } from '../notifications/notifications.service';
import { OutboxRegistry } from './outbox.registry';
import { OutboxService } from './outbox.service';

const MAX_ATTEMPTS = 12;

@Injectable()
export class OutboxProcessor implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxProcessor.name);
  private draining = false;
  private stopped = false;
  /** Back off while the database is unreachable instead of failing every tick. */
  private failures = 0;
  private pausedUntil = 0;

  constructor(
    private readonly outbox: OutboxService,
    private readonly registry: OutboxRegistry,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimePublisher,
    @Inject(JOB_SCHEDULER) private readonly jobs: JobScheduler,
  ) {}

  /** Generic delivery topics owned by the platform layer. */
  onModuleInit() {
    this.registry.on('job.schedule', async (p) => {
      await this.jobs.schedule(
        p.name as JobName,
        p.payload as Record<string, unknown>,
        Number(p.delaySeconds),
        p.dedupeId as string | undefined,
      );
    });
    this.registry.on('push.user', async (p) => {
      await this.notifications.notifyUser(
        p.userId as string,
        p.app as ClientApp,
        p.message as PushMessage,
      );
    });
    this.registry.on('push.restaurant', async (p) => {
      await this.notifications.notifyRestaurantStaff(
        p.restaurantId as string,
        p.message as PushMessage,
      );
    });
    this.registry.on('realtime.publish', async (p) => {
      await this.realtime.publish(...(p.messages as RealtimeMessage[]));
    });
  }

  onApplicationShutdown() {
    this.stopped = true;
  }

  /** Drain on a short interval; `poke()` lets latency-sensitive callers skip the wait. */
  @Interval(500)
  async tick() {
    if (process.env.OPENAPI_ONLY) return;
    await this.drain();
  }

  poke() {
    void this.drain();
  }

  private async drain() {
    if (this.draining || this.stopped || Date.now() < this.pausedUntil) return;
    this.draining = true;
    try {
      for (let round = 0; round < 10; round++) {
        const batch = await this.outbox.claimBatch();
        if (!batch.length) break;
        await Promise.all(batch.map((row) => this.deliver(row)));
      }
      this.failures = 0;
    } catch (err) {
      this.failures++;
      const backoffMs = Math.min(30_000, 500 * 2 ** this.failures);
      this.pausedUntil = Date.now() + backoffMs;
      this.logger.error(
        `outbox drain failed (retrying in ${backoffMs / 1000}s): ${(err as Error).message}`,
      );
    } finally {
      this.draining = false;
    }
  }

  private async deliver(row: {
    id: number;
    topic: Parameters<OutboxRegistry['handlersFor']>[0];
    payload: Record<string, unknown>;
    attempts: number;
  }) {
    try {
      for (const handler of this.registry.handlersFor(row.topic)) await handler(row.payload);
      await this.outbox.markProcessed(row.id);
    } catch (err) {
      const message = (err as Error).message;
      if (row.attempts >= MAX_ATTEMPTS) {
        this.logger.error(`outbox #${row.id} (${row.topic}) dead-lettered: ${message}`);
        await this.outbox.markProcessed(row.id);
        return;
      }
      this.logger.warn(
        `outbox #${row.id} (${row.topic}) attempt ${row.attempts} failed: ${message}`,
      );
      await this.outbox.markFailed(row.id, row.attempts, message);
    }
  }
}
