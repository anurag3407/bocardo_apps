import { Client } from '@upstash/qstash';
import type { JobName, JobPayload, JobScheduler } from './jobs';

/** Durable delayed jobs: QStash calls POST {API_PUBLIC_URL}/internal/jobs/:name after the delay. */
export class QStashJobScheduler implements JobScheduler {
  constructor(
    private readonly client: Client,
    private readonly baseUrl: string,
  ) {}

  async schedule(name: JobName, payload: JobPayload, delaySeconds: number, dedupeId?: string) {
    await this.client.publishJSON({
      url: `${this.baseUrl}/internal/jobs/${name}`,
      body: payload,
      delay: Math.max(0, Math.round(delaySeconds)),
      retries: 5,
      ...(dedupeId ? { deduplicationId: dedupeId.replace(/[^a-zA-Z0-9_-]/g, '_') } : {}),
    });
  }
}
