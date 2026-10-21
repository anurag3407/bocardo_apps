import type { ConnectResult, TelephonyProvider } from './telephony-provider';
import { toE164 } from './telephony-provider';

const escapeXml = (s: string) =>
  s.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!,
  );

/** Twilio: call the caller from the proxy number, then <Dial> the callee showing the same proxy number. */
export class TwilioTelephonyProvider implements TelephonyProvider {
  readonly name = 'twilio' as const;

  constructor(private readonly cfg: { accountSid: string; authToken: string; callerId: string }) {}

  async connect(input: {
    fromPhone: string;
    toPhone: string;
    timeLimitSeconds: number;
    statusCallbackUrl: string;
  }): Promise<ConnectResult> {
    const proxy = escapeXml(this.cfg.callerId);
    const twiml = `<Response><Say>Connecting your Bocardo call.</Say><Dial callerId="${proxy}" timeLimit="${input.timeLimitSeconds}">${escapeXml(toE164(input.toPhone))}</Dial></Response>`;
    const form = new URLSearchParams({
      To: toE164(input.fromPhone),
      From: this.cfg.callerId,
      Twiml: twiml,
      StatusCallback: input.statusCallbackUrl,
      StatusCallbackEvent: 'completed',
    });
    const auth = Buffer.from(`${this.cfg.accountSid}:${this.cfg.authToken}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.cfg.accountSid}/Calls.json`,
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
    if (!res.ok) throw new Error(`twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { sid: string };
    return { mode: 'callback', providerRef: data.sid };
  }

  parseStatus(body: Record<string, string>) {
    if (!body.CallSid) return null;
    const duration = Number(body.CallDuration);
    return {
      providerRef: body.CallSid,
      status: (body.CallStatus ?? 'unknown').toLowerCase(),
      durationSeconds: Number.isFinite(duration) ? duration : null,
    };
  }
}
