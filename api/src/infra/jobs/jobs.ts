import { Injectable, Logger } from '@nestjs/common';

/** Every delayed job in the system. Handlers must be idempotent (at-least-once delivery). */
export type JobName =
  'order.payment-expiry' | 'order.accept-timeout' | 'dispatch.offer-timeout' | 'dispatch.retry';

export type JobPayload = Record<string, unknown>;
export type JobHandler = (payload: JobPayload) => Promise<void>;

export interface JobScheduler {
  schedule(
    name: JobName,
    payload: JobPayload,
    delaySeconds: number,
    dedupeId?: string,
  ): Promise<void>;
}

export const JOB_SCHEDULER = Symbol('JOB_SCHEDULER');

/** Feature modules register their handlers here in onModuleInit, keeping infra free of domain imports. */
@Injectable()
export class JobRegistry {
  private readonly logger = new Logger(JobRegistry.name);
  private readonly handlers = new Map<JobName, JobHandler>();

  register(name: JobName, handler: JobHandler) {
    this.handlers.set(name, handler);
  }

  async run(name: string, payload: JobPayload) {
    const handler = this.handlers.get(name as JobName);
    if (!handler) {
      this.logger.warn(`no handler for job "${name}"`);
      return;
    }
    await handler(payload);
  }
}
