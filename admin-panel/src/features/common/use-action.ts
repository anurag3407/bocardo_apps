'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '@/core/api/api-error';

/** Wraps an admin mutation: shows failures, then refreshes all admin queries. */
export function useAction<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onError: (e) => window.alert(errorMessage(e)),
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/admin/') }),
  });
}

export const idempotency = () => ({ headers: { 'Idempotency-Key': crypto.randomUUID() } });

/** Native prompt is enough for an internal console; returns null when cancelled. */
export function ask(question: string, fallback = ''): string | null {
  const answer = window.prompt(question, fallback);
  return answer && answer.trim() ? answer.trim() : null;
}
