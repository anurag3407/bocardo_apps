import { Logger } from '@nestjs/common';
import type { App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { PushMessage, PushSender } from './push-sender';

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export class FcmPushSender implements PushSender {
  private readonly logger = new Logger(FcmPushSender.name);

  constructor(private readonly app: App) {}

  async send(tokens: string[], message: PushMessage) {
    if (!tokens.length) return { invalidTokens: [] };
    const ringing = message.channel === 'orders' || message.channel === 'offers';
    const res = await getMessaging(this.app).sendEachForMulticast({
      tokens,
      notification: { title: message.title, body: message.body },
      data: message.data,
      android: {
        priority: 'high',
        notification: {
          channelId: message.channel ?? 'updates',
          sound: ringing ? 'order_ring' : 'default',
        },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: {
          aps: {
            sound: ringing ? 'order_ring.wav' : 'default',
            ...(ringing ? { 'interruption-level': 'time-sensitive' } : {}),
          },
        },
      },
    });
    const invalidTokens: string[] = [];
    res.responses.forEach((r, i) => {
      if (!r.success && r.error && INVALID_TOKEN_CODES.has(r.error.code))
        invalidTokens.push(tokens[i]);
      else if (!r.success) this.logger.warn(`push failed: ${r.error?.code} ${r.error?.message}`);
    });
    return { invalidTokens };
  }
}
