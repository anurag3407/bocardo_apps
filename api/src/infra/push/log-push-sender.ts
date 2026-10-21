import { Logger } from '@nestjs/common';
import type { PushMessage, PushSender } from './push-sender';

/** Dev fallback when Firebase credentials are absent. */
export class LogPushSender implements PushSender {
  private readonly logger = new Logger('Push');

  async send(tokens: string[], message: PushMessage) {
    this.logger.log(
      `[${message.channel ?? 'updates'}] → ${tokens.length} device(s): ${message.title} — ${message.body}`,
    );
    return { invalidTokens: [] };
  }
}
