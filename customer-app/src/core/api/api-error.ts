/** Mirrors the API error envelope: { error: { code, message, details }, requestId }. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetwork() {
    return this.status === 0;
  }
}

export const isApiError = (e: unknown, code?: string): e is ApiError => e instanceof ApiError && (!code || e.code === code);

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'TIMEOUT') return 'Request timed out. Please check your connection and try again.';
    if (e.isNetwork) return 'No internet connection. Please try again.';
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}
