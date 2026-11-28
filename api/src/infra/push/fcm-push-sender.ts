import { Logger } from '@nestjs/common';
import type { App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { PushMessage, PushSender } from './push-sender';

const FCM_MULTICAST_LIMIT = 500;

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export class FcmPushSender implements PushSender {
  private readonly logger = new Logger(FcmPushSender.name);

  constructor(private readonly app: App) {}

  async send(tokens: string[], message: PushMessage) {
    const uniqueTokens = [...new Set(tokens.filter(Boolean))];
    if (!uniqueTokens.length) return { invalidTokens: [] };

    const channel = message.channel ?? 'updates';
    const ringing = channel === 'orders' || channel === 'offers';
    const data = { ...message.data, channel };
    const invalidTokens: string[] = [];
    const messaging = getMessaging(this.app);

    for (let offset = 0; offset < uniqueTokens.length; offset += FCM_MULTICAST_LIMIT) {
      const batch = uniqueTokens.slice(offset, offset + FCM_MULTICAST_LIMIT);
      const res = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: { title: message.title, body: message.body },
        data,
        android: {
          priority: 'high',
          notification: {
            channelId: channel,
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
      res.responses.forEach((r, i) => {
        if (!r.success && r.error && INVALID_TOKEN_CODES.has(r.error.code)) {
          invalidTokens.push(batch[i]);
        } else if (!r.success) {
          this.logger.warn(`push failed: ${r.error?.code} ${r.error?.message}`);
        }
      });
    }

    return { invalidTokens };
  }
}
