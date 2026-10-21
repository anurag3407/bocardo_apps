import type { ConnectResult, TelephonyProvider } from './telephony-provider';
import { toE164 } from './telephony-provider';

/**
 * Exotel "click-to-call": Exotel calls `From` first, then connects `To`. Both legs show the
 * ExoPhone (`CallerId`), so rider and customer never learn each other's numbers.
 * https://developer.exotel.com/api/make-a-call-api
 */
export class ExotelTelephonyProvider implements TelephonyProvider {
  readonly name = 'exotel' as const;

  constructor(
    private readonly cfg: {
      sid: string;
      apiKey: string;
      apiToken: string;
      subdomain: string;
      callerId: string;
    },
  ) {}

  async connect(input: {
    fromPhone: string;
    toPhone: string;
    timeLimitSeconds: number;
    statusCallbackUrl: string;
  }): Promise<ConnectResult> {
    const form = new URLSearchParams({
      From: toE164(input.fromPhone),
      To: toE164(input.toPhone),
      CallerId: this.cfg.callerId,
      TimeLimit: String(input.timeLimitSeconds),
      TimeOut: '30',
      StatusCallback: input.statusCallbackUrl,
      'StatusCallbackEvents[0]': 'terminal',
    });
    const auth = Buffer.from(`${this.cfg.apiKey}:${this.cfg.apiToken}`).toString('base64');
    const res = await fetch(
      `https://${this.cfg.subdomain}/v1/Accounts/${this.cfg.sid}/Calls/connect.json`,
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
    if (!res.ok) throw new Error(`exotel ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { Call: { Sid: string } };
    return { mode: 'callback', providerRef: data.Call.Sid };
  }

  parseStatus(body: Record<string, string>) {
    if (!body.CallSid) return null;
    const duration = Number(body.ConversationDuration ?? body.Duration);
    return {
      providerRef: body.CallSid,
      status: (body.Status ?? 'unknown').toLowerCase(),
      durationSeconds: Number.isFinite(duration) ? duration : null,
    };
  }
}
