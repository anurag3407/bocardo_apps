import { Logger } from '@nestjs/common';
import type { JobName, JobPayload, JobRegistry, JobScheduler } from './jobs';

/** In-process timers for local dev. Jobs are lost on restart — production uses QStash. */
export class LocalJobScheduler implements JobScheduler {
  private readonly logger = new Logger(LocalJobScheduler.name);
  private readonly pending = new Map<string, NodeJS.Timeout>();

  constructor(private readonly registry: JobRegistry) {}

  async schedule(name: JobName, payload: JobPayload, delaySeconds: number, dedupeId?: string) {
    if (dedupeId && this.pending.has(dedupeId)) return;
    const timer = setTimeout(() => {
      if (dedupeId) this.pending.delete(dedupeId);
      this.registry
        .run(name, payload)
        .catch((err) => this.logger.error(`job ${name} failed`, err.stack));
    }, delaySeconds * 1000);
    timer.unref();
    if (dedupeId) this.pending.set(dedupeId, timer);
  }
}
