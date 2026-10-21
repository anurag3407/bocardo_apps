import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';

export interface RealtimeMessage {
  topic: string;
  event: string;
  payload: Record<string, unknown>;
}

/**
 * Server-side publisher for Supabase Realtime *private* broadcast channels.
 * Who may subscribe to which topic is enforced by RLS on realtime.messages (migration 0002).
 */
@Injectable()
export class RealtimePublisher {
  private readonly logger = new Logger(RealtimePublisher.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  async publish(...messages: RealtimeMessage[]) {
    if (!messages.length) return;
    if (!this.env.SUPABASE_SERVICE_ROLE_KEY) {
      messages.forEach((m) => this.logger.debug(`[realtime:dry-run] ${m.topic} ${m.event}`));
      return;
    }
    const res = await fetch(`${this.env.SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ messages: messages.map((m) => ({ ...m, private: true })) }),
    });
    if (!res.ok) throw new Error(`realtime broadcast failed: ${res.status} ${await res.text()}`);
  }
}

export const topics = {
  order: (orderId: string) => `order:${orderId}`,
  restaurant: (restaurantId: string) => `restaurant:${restaurantId}`,
  rider: (riderId: string) => `rider:${riderId}`,
  adminOps: (cityId: string) => `admin:ops:${cityId}`,
};
