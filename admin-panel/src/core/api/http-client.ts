import { supabase } from '../auth/supabase-browser';
import { env } from '../config/env';
import { ApiError } from './api-error';

/** Single HTTP entry point (also the orval mutator). Attaches the admin's Supabase JWT. */
export async function httpClient<T>(url: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  let res: Response;
  try {
    res = await fetch(`${env.apiUrl}${url}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the Bocardo API');
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const err = body?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'HTTP_ERROR', err.message ?? `Request failed (${res.status})`, err.details, body?.requestId);
  }
  return body as T;
}

export default httpClient;

/** Orval uses these to type `error` in generated hooks. */
export type ErrorType<_E> = ApiError;
export type BodyType<B> = B;
