import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { sql } from 'kysely';
import { randomBytes } from 'node:crypto';
import { AppError } from '../../common/errors/app-error';
import { ENV, type Env } from '../../config/env';
import { DB, type Db } from '../../infra/database/database';
import { FIREBASE_APP } from '../../infra/firebase/firebase-app';
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
    @Inject(FIREBASE_APP) private readonly firebase: App | null,
    private readonly human: HumanVerifier,
    private readonly config: AppConfigService,
    private readonly realtime: RealtimePublisher,
  ) {
    // Without the hook secret Supabase cannot deliver an OTP through this API, so the ticket
    // gate is bypassed entirely (Supabase falls back to its own SMS provider).
    if (!this.env.SUPABASE_SEND_SMS_HOOK_SECRET) {
      this.logger.warn(
        'SUPABASE_SEND_SMS_HOOK_SECRET is empty — the Supabase Send-SMS hook will reject every call; OTPs will be sent by Supabase’s own provider instead (see docs/runbook.md → SMS OTP)',
      );
    }
    if (this.env.SMS_PROVIDER === 'log') {
      this.logger.warn(
        'SMS_PROVIDER=log — OTPs are written to this log only; set DEV_OTP_WEBHOOK_URL to forward them to ntfy/Discord/Slack',
      );
    }
  }

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

  /**
   * Verifies a Firebase Phone Auth ID token and exchanges it for a genuine Supabase Auth session
   * so Postgres `auth.users`, `profiles`, RLS, Realtime, and Storage keep working seamlessly.
   */
  async exchangeFirebasePhone(input: { idToken: string; ip: string }) {
    if (!this.firebase) {
      throw new AppError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'FIREBASE_UNAVAILABLE',
        'Phone authentication is not configured',
      );
    }
    if (!this.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new AppError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'SUPABASE_ADMIN_UNAVAILABLE',
        'Session issuer is not configured',
      );
    }

    let decoded: { phone_number?: string };
    try {
      decoded = await getAuth(this.firebase).verifyIdToken(input.idToken, true);
    } catch (err) {
      this.logger.warn(`firebase phone token rejected (${(err as Error).message}) from ${input.ip}`);
      throw AppError.unauthorized('Invalid or expired verification code');
    }
    if (!decoded.phone_number) {
      throw AppError.badRequest(
        'MISSING_PHONE',
        'Verification token does not include a phone number',
      );
    }

    const cfg = await this.config.get<OtpConfig>('otp', {
      allowedCountryCodes: ['91'],
      hourlyBudget: 5000,
    });
    const parsed = normalizeOtpPhone(decoded.phone_number, cfg.allowedCountryCodes);
    if (!parsed.ok) {
      throw AppError.badRequest(
        parsed.reason,
        parsed.reason === 'COUNTRY_NOT_SUPPORTED'
          ? 'Bocardo is available for Indian mobile numbers only'
          : 'Enter a valid mobile number',
      );
    }

    const digits = parsed.phone;
    const e164 = `+${digits}`;
    const password = randomBytes(32).toString('base64url');
    const isSecretKey = this.env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_secret_');
    const adminHeaders: Record<string, string> = {
      apikey: this.env.SUPABASE_SERVICE_ROLE_KEY,
      ...(isSecretKey ? {} : { Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}` }),
      'Content-Type': 'application/json',
    };

    const existing = await sql<{ id: string }>`
      select id from auth.users where phone in (${digits}, ${e164}) limit 1
    `.execute(this.db);
    let userId = existing.rows[0]?.id;

    if (!userId) {
      const createRes = await fetch(`${this.env.SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ phone: e164, phone_confirm: true, password }),
        signal: AbortSignal.timeout(8000),
      });
      if (!createRes.ok) {
        // Concurrent first-time login for the same phone: re-check auth.users once before failing.
        const retry = await sql<{ id: string }>`
          select id from auth.users where phone in (${digits}, ${e164}) limit 1
        `.execute(this.db);
        userId = retry.rows[0]?.id;
        if (!userId) {
          const msg = await createRes.text().catch(() => String(createRes.status));
          throw new Error(`supabase admin createUser failed: ${msg}`);
        }
      }
    }

    if (userId) {
      const updateRes = await fetch(`${this.env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ phone_confirm: true, password }),
        signal: AbortSignal.timeout(8000),
      });
      if (!updateRes.ok) {
        const msg = await updateRes.text().catch(() => String(updateRes.status));
        throw new Error(`supabase admin updateUser failed: ${msg}`);
      }
    }

    const tokenRes = await fetch(`${this.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: this.env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone: e164, password }),
      signal: AbortSignal.timeout(8000),
    });
    const tokenBody = (await tokenRes.json().catch(() => null)) as {
      access_token?: string;
      refresh_token?: string;
      error_description?: string;
      msg?: string;
    } | null;
    if (!tokenRes.ok || !tokenBody?.access_token || !tokenBody.refresh_token) {
      throw new Error(
        `supabase session grant failed: ${tokenBody?.error_description ?? tokenBody?.msg ?? tokenRes.status}`,
      );
    }

    return {
      accessToken: tokenBody.access_token,
      refreshToken: tokenBody.refresh_token,
    };
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
