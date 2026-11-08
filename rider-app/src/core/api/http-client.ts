import { supabase } from '../auth/supabase';
import { env } from '../config/env';
import { ApiError } from './api-error';

const TIMEOUT_MS = 15_000;

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

async function send(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  init.signal?.addEventListener('abort', () => controller.abort());
  try {
    return await fetch(`${env.apiUrl}${url}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(await authHeader()), ...init.headers },
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new ApiError(0, 'TIMEOUT', 'Request timed out. Please try again.');
    }
    const message = err instanceof Error && err.message ? err.message : 'Network request failed';
    throw new ApiError(0, 'NETWORK_ERROR', message);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The single HTTP entry point (also the orval mutator for generated hooks).
 * Adds auth, times out, refreshes an expired session once, and turns error
 * envelopes into ApiError so screens can switch on `error.code`.
 */
export async function httpClient<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res = await send(url, init);
  if (res.status === 401) {
    const { data } = await supabase.auth.refreshSession();
    if (data.session) res = await send(url, init);
  }
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (!res.ok) {
    const err = body?.error ?? {};
    throw new ApiError(
      res.status,
      err.code ?? 'HTTP_ERROR',
      err.message ?? (res.status >= 500 ? 'Server temporarily unavailable' : `Request failed (${res.status})`),
      err.details,
      body?.requestId,
    );
  }
  return body as T;
}

export default httpClient;

/** Orval uses these to type `error` in generated hooks. */
export type ErrorType<_E> = ApiError;
export type BodyType<B> = B;
