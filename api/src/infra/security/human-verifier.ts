import { Inject, Injectable, Logger } from '@nestjs/common';
import type { App } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { ENV, type Env } from '../../config/env';
import { FIREBASE_APP } from '../firebase/firebase-app';

export type HumanCheck =
  { ok: true; via: 'app_check' | 'turnstile' | 'skipped' } | { ok: false; reason: string };

/**
 * Proves a request comes from a genuine app install (Firebase App Check: Play Integrity /
 * App Attest) or a real browser (Cloudflare Turnstile) — the gate in front of SMS spend.
 */
@Injectable()
export class HumanVerifier {
  private readonly logger = new Logger(HumanVerifier.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(FIREBASE_APP) private readonly firebase: App | null,
  ) {}

  async verify(input: {
    appCheckToken?: string;
    turnstileToken?: string;
    ip?: string;
  }): Promise<HumanCheck> {
    if (input.appCheckToken) return this.appCheck(input.appCheckToken);
    if (input.turnstileToken) return this.turnstile(input.turnstileToken, input.ip);
    if (this.env.OTP_HUMAN_CHECK === 'optional') return { ok: true, via: 'skipped' };
    return { ok: false, reason: 'missing attestation' };
  }

  private async appCheck(token: string): Promise<HumanCheck> {
    if (!this.firebase) {
      return this.env.OTP_HUMAN_CHECK === 'optional'
        ? { ok: true, via: 'skipped' }
        : { ok: false, reason: 'app check unavailable' };
    }
    try {
      // limited-use tokens are consumed so a captured token cannot be replayed by a bot
      const res = await getAppCheck(this.firebase).verifyToken(token, { consume: true });
      if (res.alreadyConsumed) return { ok: false, reason: 'replayed app check token' };
      return { ok: true, via: 'app_check' };
    } catch (err) {
      this.logger.warn(`app check rejected: ${(err as Error).message}`);
      return { ok: false, reason: 'invalid app check token' };
    }
  }

  private async turnstile(token: string, ip?: string): Promise<HumanCheck> {
    if (!this.env.TURNSTILE_SECRET_KEY) {
      return this.env.OTP_HUMAN_CHECK === 'optional'
        ? { ok: true, via: 'skipped' }
        : { ok: false, reason: 'turnstile unavailable' };
    }
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: this.env.TURNSTILE_SECRET_KEY,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { success?: boolean } | null;
    return data?.success
      ? { ok: true, via: 'turnstile' }
      : { ok: false, reason: 'turnstile failed' };
  }
}
