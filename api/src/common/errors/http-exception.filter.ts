import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
  requestId: string;
}

/** Normalises every error into `{ error: { code, message, details }, requestId }`. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const { status, body } = this.toBody(exception, String(request.id));

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        (exception as Error)?.stack,
      );
    }
    void reply.status(status).send(body);
  }

  private toBody(exception: unknown, requestId: string): { status: number; body: ErrorBody } {
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError() as ZodError;
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: zodError.issues },
          requestId,
        },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null && 'code' in res) {
        const { code, message, details } = res as {
          code: string;
          message: string;
          details?: unknown;
        };
        return { status, body: { error: { code, message, details }, requestId } };
      }
      const message =
        typeof res === 'string'
          ? res
          : ((res as { message?: string }).message ?? exception.message);
      return {
        status,
        body: {
          error: { code: HttpStatus[status] ?? 'ERROR', message: String(message) },
          requestId,
        },
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' }, requestId },
    };
  }
}
