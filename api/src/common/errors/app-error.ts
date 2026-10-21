import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The only error type business code throws. `code` is a stable, machine-readable
 * identifier the apps switch on (e.g. RESTAURANT_CLOSED); `message` is for humans.
 */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }

  static badRequest(code: string, message: string, details?: unknown) {
    return new AppError(HttpStatus.BAD_REQUEST, code, message, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new AppError(HttpStatus.FORBIDDEN, 'FORBIDDEN', message);
  }
  static notFound(entity: string) {
    return new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${entity} not found`);
  }
  static conflict(code: string, message: string, details?: unknown) {
    return new AppError(HttpStatus.CONFLICT, code, message, details);
  }
  static unprocessable(code: string, message: string, details?: unknown) {
    return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
  }
  static tooManyRequests(message = 'Too many requests, slow down') {
    return new AppError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', message);
  }
}
