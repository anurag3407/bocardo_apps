import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, JWTPayload, jwtVerify } from 'jose';
import { ENV, type Env } from '../../config/env';
import type { AdminRole, AppRole, AuthUser } from './auth-user';

interface SupabaseClaims extends JWTPayload {
  phone?: string;
  email?: string;
  role?: string;
  app_roles?: AppRole[];
  admin_role?: AdminRole | null;
  is_blocked?: boolean;
}

/**
 * Verifies Supabase access tokens locally (no network round-trip per request).
 * Asymmetric projects verify against the cached JWKS; legacy projects use the HS256 secret.
 */
@Injectable()
export class TokenVerifier {
  private readonly issuer: string;
  private readonly key: Parameters<typeof jwtVerify>[1];

  constructor(@Inject(ENV) env: Env) {
    this.issuer = `${env.SUPABASE_URL}/auth/v1`;
    this.key = env.SUPABASE_JWT_SECRET
      ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
      : createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
  }

  async verify(token: string): Promise<AuthUser & { isBlocked: boolean }> {
    const { payload } = await jwtVerify<SupabaseClaims>(token, this.key as never, {
      issuer: this.issuer,
      audience: 'authenticated',
    });
    if (!payload.sub) throw new Error('token has no subject');
    return {
      id: payload.sub,
      roles: payload.app_roles?.length ? payload.app_roles : ['customer'],
      adminRole: payload.admin_role ?? null,
      phone: payload.phone || undefined,
      email: payload.email || undefined,
      isBlocked: payload.is_blocked === true,
    };
  }
}
