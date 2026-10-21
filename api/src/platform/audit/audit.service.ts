import { Injectable } from '@nestjs/common';
import { json, type Executor } from '../../infra/database/database';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

/** Append-only record of every privileged (admin) mutation. */
@Injectable()
export class AuditService {
  async record(executor: Executor, entry: AuditEntry) {
    await executor
      .insertInto('audit_logs')
      .values({
        actor_id: entry.actorId,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId ?? null,
        before: entry.before === undefined ? null : json(entry.before),
        after: entry.after === undefined ? null : json(entry.after),
      })
      .execute();
  }
}
