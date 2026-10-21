import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  applyDecorators,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { KV_STORE, type KvStore } from '../../infra/kv/kv-store';
import { AppError } from '../errors/app-error';
import type { AppRequest } from '../http/request-context';

interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
}

const RATE_LIMIT = 'rateLimit';

/** Fixed-window limiter keyed by user (or IP when anonymous) + route. Fails open if the store is down. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(KV_STORE) private readonly kv: KvStore,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const opts = this.reflector.get<RateLimitOptions>(RATE_LIMIT, ctx.getHandler());
    if (!opts) return true;
    const request = ctx.switchToHttp().getRequest<AppRequest>();
    const who = request.user?.id ?? request.ip;
    const window = Math.floor(Date.now() / 1000 / opts.windowSeconds);
    const key = `rl:${request.routeOptions.url}:${who}:${window}`;
    try {
      const count = await this.kv.incr(key, opts.windowSeconds);
      if (count > opts.limit) throw AppError.tooManyRequests();
    } catch (err) {
      if (err instanceof AppError) throw err;
      // limiter outage must not take the API down
    }
    return true;
  }
}

export const RateLimit = (limit: number, windowSeconds: number) =>
  applyDecorators(SetMetadata(RATE_LIMIT, { limit, windowSeconds }), UseGuards(RateLimitGuard));
