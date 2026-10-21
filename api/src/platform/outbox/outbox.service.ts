import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DB, json, type Db, type Executor } from '../../infra/database/database';

export type OutboxTopic =
  | 'order.status_changed'
  | 'order.dispatch_changed'
  | 'dispatch.start'
  | 'refund.process'
  | 'job.schedule'
  | 'push.user'
  | 'push.restaurant'
  | 'realtime.publish';

export interface OutboxRow {
  id: number;
  topic: OutboxTopic;
  payload: Record<string, unknown>;
  attempts: number;
}

const BATCH_SIZE = 50;
const LOCK_SECONDS = 30;

/**
 * Transactional outbox. Callers enqueue side effects inside the same transaction as the
 * state change; the processor delivers them at-least-once after commit.
 */
@Injectable()
export class OutboxService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async enqueue(
    executor: Executor,
    topic: OutboxTopic,
    payload: Record<string, unknown>,
    delaySeconds = 0,
  ) {
    await executor
      .insertInto('outbox')
      .values({
        topic,
        payload: json(payload),
        ...(delaySeconds > 0
          ? { available_at: sql`now() + make_interval(secs => ${delaySeconds})` as never }
          : {}),
      })
      .execute();
  }

  /** Claims a batch with SKIP LOCKED so any number of API instances can drain concurrently. */
  async claimBatch(): Promise<OutboxRow[]> {
    const result = await sql<OutboxRow>`
      update outbox set locked_until = now() + make_interval(secs => ${LOCK_SECONDS}), attempts = attempts + 1
      where id in (
        select id from outbox
        where processed_at is null and available_at <= now()
          and (locked_until is null or locked_until < now())
        order by id
        limit ${BATCH_SIZE}
        for update skip locked
      )
      returning id, topic, payload, attempts`.execute(this.db);
    return result.rows;
  }

  async markProcessed(id: number) {
    await this.db
      .updateTable('outbox')
      .set({ processed_at: new Date(), locked_until: null })
      .where('id', '=', id)
      .execute();
  }

  /** Exponential backoff capped at 10 minutes. */
  async markFailed(id: number, attempts: number, error: string) {
    const backoffSeconds = Math.min(600, 2 ** Math.min(attempts, 10));
    await this.db
      .updateTable('outbox')
      .set({
        last_error: error.slice(0, 2000),
        locked_until: null,
        available_at: sql`now() + make_interval(secs => ${backoffSeconds})` as never,
      })
      .where('id', '=', id)
      .execute();
  }
}
