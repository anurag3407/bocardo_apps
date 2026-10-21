import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { IdempotencyInterceptor } from './idempotency.interceptor';

export const IDEMPOTENT = 'idempotent';

/**
 * Requires an `Idempotency-Key` header; a retried request with the same key replays the
 * first response instead of re-executing (double-tap "Place order", flaky networks).
 */
export const Idempotent = () =>
  applyDecorators(
    SetMetadata(IDEMPOTENT, true),
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      description: 'Unique per logical operation (UUID)',
    }),
    UseInterceptors(IdempotencyInterceptor),
  );
