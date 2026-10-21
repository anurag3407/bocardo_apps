import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { ENV, type Env } from '../../config/env';
import { DB, type Db } from '../../infra/database/database';
import { KV_STORE, type KvStore } from '../../infra/kv/kv-store';
import { RealtimePublisher } from '../../infra/realtime/realtime-publisher';
import { HumanVerifier } from '../../infra/security/human-verifier';
import { SMS_SENDER, type SmsSender } from '../../infra/sms/sms-sender';
import { AppConfigService } from '../../platform/config/app-config.service';
import { normalizeOtpPhone } from './otp-rules';

const TICKET_TTL_S = 180;
const LIMITS = {
  perPhone10Min: 3,
  perPhoneDay: 10,
  perIpHour: 10,
};
const ticketKey = (phone: string) => `otp-ticket:${phone}`;

interface OtpConfig {
  allowedCountryCodes: string[];
  hourlyBudget: number;
}

/**
 * SMS toll-fraud defence. Clients must obtain a short-lived, single-use "ticket" from us
 * (App Check / Turnstile verified, rate limited, country restricted) before asking Supabase
 * for an OTP; Supabase's Send-SMS hook then only sends when a ticket exists for that number.
 * Bots that call Supabase Auth directly get nothing sent.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KV_STORE) private readonly kv: KvStore,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    @Inject(ENV) private readonly env: Env,
    private readonly human: HumanVerifier,
    private readonly config: AppConfigService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async issueTicket(input: {
    phone: string;
    appCheckToken?: string;
    turnstileToken?: string;
    ip: string;
  }) {
    const cfg = await this.config.get<OtpConfig>('otp', {
      allowedCountryCodes: ['91'],
      hourlyBudget: 5000,
    });
    const parsed = normalizeOtpPhone(input.phone, cfg.allowedCountryCodes);
    if (!parsed.ok) {
      throw AppError.badRequest(
        parsed.reason,
        parsed.reason === 'COUNTRY_NOT_SUPPORTED'
          ? 'Bocardo is available for Indian mobile numbers only'
          : 'Enter a valid mobile number',
      );
    }
    const human = await this.human.verify(input);
    if (!human.ok) {
      this.logger.warn(
        `otp ticket denied (${human.reason}) for ${mask(parsed.phone)} from ${input.ip}`,
      );
      throw AppError.forbidden('Please update the app and try again');
    }

    const hour = Math.floor(Date.now() / 3_600_000);
    const day = Math.floor(Date.now() / 86_400_000);
    const tenMin = Math.floor(Date.now() / 600_000);
    const [phone10, phoneDay, ipHour, global] = await Promise.all([
      this.kv.incr(`otp:p10:${parsed.phone}:${tenMin}`, 600),
      this.kv.incr(`otp:pday:${parsed.phone}:${day}`, 86_400),
      this.kv.incr(`otp:ip:${input.ip}:${hour}`, 3600),
      this.kv.incr(`otp:global:${hour}`, 3600),
    ]);
    if (
      phone10 > LIMITS.perPhone10Min ||
      phoneDay > LIMITS.perPhoneDay ||
      ipHour > LIMITS.perIpHour
    ) {
      throw AppError.tooManyRequests('Too many attempts. Please wait a few minutes and try again.');
    }
    if (global > cfg.hourlyBudget) {
      // circuit breaker: an attack in progress must not burn the SMS budget
      if (global === cfg.hourlyBudget + 1) {
        this.logger.error(
          `OTP hourly budget (${cfg.hourlyBudget}) exhausted — possible SMS pumping attack`,
        );
        void this.realtime
          .publish({
            topic: 'admin:security',
            event: 'otp_budget_exhausted',
            payload: { budget: cfg.hourlyBudget },
          })
          .catch(() => undefined);
      }
      throw AppError.tooManyRequests('Login is temporarily busy. Please try again shortly.');
    }

    await this.kv.set(ticketKey(parsed.phone), { via: human.via }, { ttlSeconds: TICKET_TTL_S });
    return { phone: `+${parsed.phone}`, expiresInSeconds: TICKET_TTL_S };
  }

  /** Supabase Send-SMS hook: deliver only if a ticket was issued for this number (single use). */
  async deliverFromHook(phone: string, otp: string): Promise<{ sent: boolean; reason?: string }> {
    const digits = phone.replace(/\D/g, '');
    const ticket = await this.kv.get(ticketKey(digits));
    if (!ticket) {
      await this.log(digits, 'blocked_no_ticket');
      return { sent: false, reason: 'OTP request was not verified' };
    }
    await this.kv.del(ticketKey(digits));
    try {
      await this.sms.sendOtp(digits, otp);
      await this.log(digits, 'sent');
      return { sent: true };
    } catch (err) {
      await this.log(digits, 'failed', (err as Error).message);
      throw err;
    }
  }

  private async log(
    phone: string,
    outcome: 'sent' | 'blocked_no_ticket' | 'failed',
    error?: string,
  ) {
    await this.db
      .insertInto('otp_send_log')
      .values({ phone, outcome, provider: this.sms.name, error: error ?? null })
      .execute()
      .catch((e) => this.logger.warn(`otp log failed: ${e.message}`));
  }

  get hookSecret() {
    return this.env.SUPABASE_SEND_SMS_HOOK_SECRET;
  }
}

const mask = (phone: string) => `${phone.slice(0, 4)}…${phone.slice(-2)}`;
