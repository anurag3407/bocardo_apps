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
    const isDiscord = this.devWebhookUrl.includes('discord.com/api/webhooks');
    const isSlack = this.devWebhookUrl.includes('hooks.slack.com');
    const body = isDiscord
      ? JSON.stringify({ content: text })
      : isSlack
        ? JSON.stringify({ text })
        : text;
    let res: Response;
    try {
      res = await fetch(this.devWebhookUrl, {
        method: 'POST',
        headers:
          isDiscord || isSlack
            ? { 'Content-Type': 'application/json' }
            : { 'Content-Type': 'text/plain', Title: 'Bocardo Dev OTP' },
        body,
        signal: AbortSignal.timeout(4000),
      });
    } catch (err) {
      // surface the network cause (ENOTFOUND / ETIMEDOUT / CERT_…) instead of bare "fetch failed"
      const cause = (err as { cause?: { code?: string; message?: string } }).cause;
      throw new Error(
        `dev OTP webhook unreachable: ${cause?.code ?? cause?.message ?? 'network error'}`,
        { cause: err },
      );
    }
    // A configured sink that drops the message means the OTP reached nobody; report it so the
    // caller logs the attempt as failed and Supabase shows an error instead of a silent success.
    if (!res.ok) throw new Error(`dev OTP webhook returned ${res.status}`);
  }
}
