import { Injectable } from '@nestjs/common';
import type { OutboxTopic } from './outbox.service';

export type OutboxHandler = (payload: Record<string, unknown>) => Promise<void>;

/** Topic → handler map. Domain modules register their handlers in onModuleInit. */
@Injectable()
export class OutboxRegistry {
  private readonly handlers = new Map<OutboxTopic, OutboxHandler[]>();

  on(topic: OutboxTopic, handler: OutboxHandler) {
    this.handlers.set(topic, [...(this.handlers.get(topic) ?? []), handler]);
  }

  handlersFor(topic: OutboxTopic): OutboxHandler[] {
    return this.handlers.get(topic) ?? [];
  }
}
