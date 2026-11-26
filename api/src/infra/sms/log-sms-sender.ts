import { Logger } from '@nestjs/common';
import type { SmsSender } from './sms-sender';

/**
 * Development / free-tier staging: prints the OTP to server logs and optionally forwards it
 * to a private webhook (e.g. ntfy.sh, Discord, Slack) so testers can verify without SMS spend.
 */
export class LogSmsSender implements SmsSender {
  readonly name = 'log' as const;
  private readonly logger = new Logger('Sms');

  constructor(private readonly devWebhookUrl?: string) {}

  async sendOtp(phone: string, otp: string) {
    const masked = `${phone.slice(0, 4)}…${phone.slice(-2)}`;
    this.logger.log(`OTP for ${masked}: ${otp}`);
    if (!this.devWebhookUrl) return;

    const text = `[Bocardo Dev OTP] +${phone}: ${otp}`;
    try {
      const isDiscord = this.devWebhookUrl.includes('discord.com/api/webhooks');
      const isSlack = this.devWebhookUrl.includes('hooks.slack.com');
      await fetch(this.devWebhookUrl, {
        method: 'POST',
        headers:
          isDiscord || isSlack
            ? { 'Content-Type': 'application/json' }
            : { 'Content-Type': 'text/plain', Title: 'Bocardo Dev OTP' },
        body: isDiscord
          ? JSON.stringify({ content: text })
          : isSlack
            ? JSON.stringify({ text })
            : text,
        signal: AbortSignal.timeout(4000),
      });
    } catch (err) {
      this.logger.warn(`dev OTP webhook failed: ${(err as Error).message}`);
    }
  }
}
