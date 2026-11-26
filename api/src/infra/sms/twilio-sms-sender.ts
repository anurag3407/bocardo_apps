import type { SmsSender } from './sms-sender';

/**
 * Twilio Programmable SMS via the Supabase Send-SMS hook (keeps Bocardo's anti-pumping
 * ticket check in front of every SMS). Uses either a Messaging Service SID or a From number.
 */
export class TwilioSmsSender implements SmsSender {
  readonly name = 'twilio' as const;

  constructor(
    private readonly cfg: {
      accountSid: string;
      authToken: string;
      messagingServiceSid?: string;
      fromNumber?: string;
    },
  ) {}

  async sendOtp(phone: string, otp: string) {
    const digits = phone.replace(/\D/g, '');
    const form = new URLSearchParams({
      To: `+${digits}`,
      Body: `${otp} is your Bocardo login code. Do not share it with anyone.`,
      ...(this.cfg.messagingServiceSid
        ? { MessagingServiceSid: this.cfg.messagingServiceSid }
        : { From: this.cfg.fromNumber! }),
    });
    const auth = Buffer.from(`${this.cfg.accountSid}:${this.cfg.authToken}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.cfg.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(`twilio: ${body?.message ?? res.status}`);
    }
  }
}
