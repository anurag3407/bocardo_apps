import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { from, Observable, of, switchMap, tap, catchError, throwError } from 'rxjs';
import { KV_STORE, type KvStore } from '../../infra/kv/kv-store';
import { AppError } from '../errors/app-error';
import type { AppRequest } from '../http/request-context';

type Stored = { state: 'processing' } | { state: 'done'; body: unknown };

const PROCESSING_TTL_S = 60;
const RESULT_TTL_S = 24 * 60 * 60;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(KV_STORE) private readonly kv: KvStore) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = ctx.switchToHttp().getRequest<AppRequest>();
    const header = request.headers['idempotency-key'];
    const key = Array.isArray(header) ? header[0] : header;
    if (!key || key.length < 8 || key.length > 128) {
      throw AppError.badRequest(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key header (8-128 chars) is required',
      );
    }
    const storeKey = `idem:${request.user?.id ?? 'anon'}:${request.routeOptions.url}:${key}`;

    return from(
      this.kv.set(storeKey, { state: 'processing' } satisfies Stored, {
        ttlSeconds: PROCESSING_TTL_S,
        onlyIfAbsent: true,
      }),
    ).pipe(
      switchMap((acquired) => {
        if (acquired) {
          return next.handle().pipe(
            tap(
              (body) =>
                void this.kv.set(storeKey, { state: 'done', body } satisfies Stored, {
                  ttlSeconds: RESULT_TTL_S,
                }),
            ),
            catchError((err) =>
              from(this.kv.del(storeKey)).pipe(switchMap(() => throwError(() => err))),
            ),
          );
        }
        return from(this.kv.get<Stored>(storeKey)).pipe(
          switchMap((stored) => {
            if (stored?.state === 'done') return of(stored.body);
            throw AppError.conflict(
              'REQUEST_IN_PROGRESS',
              'This request is already being processed',
            );
          }),
        );
      }),
    );
  }
}
