import type { SmsSender } from './sms-sender';

/**
 * MSG91 Flow API with a TRAI-DLT-registered template. Indian operators drop any SMS whose
 * header, principal entity or content template is not registered on DLT, so all three are
 * passed explicitly. https://docs.msg91.com/reference/send-sms
 */
export class Msg91SmsSender implements SmsSender {
  readonly name = 'msg91' as const;

  constructor(
    private readonly cfg: {
      authKey: string;
      templateId: string;
      senderId: string;
      dltEntityId?: string;
      dltTemplateId?: string;
    },
  ) {}

  async sendOtp(phone: string, otp: string) {
    const res = await fetch('https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: {
        authkey: this.cfg.authKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        template_id: this.cfg.templateId,
        sender: this.cfg.senderId,
        short_url: '0',
        ...(this.cfg.dltEntityId ? { DLT_PE_ID: this.cfg.dltEntityId } : {}),
        ...(this.cfg.dltTemplateId ? { DLT_TE_ID: this.cfg.dltTemplateId } : {}),
        recipients: [{ mobiles: phone.replace(/\D/g, ''), otp }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok || body.type === 'error') throw new Error(`msg91: ${body.message ?? res.status}`);
  }
}
