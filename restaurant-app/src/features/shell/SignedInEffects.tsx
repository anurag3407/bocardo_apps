import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { enablePush, onNotificationTap } from '@/core/notifications/push';

/** Side effects that only make sense with a session: push registration + deep links from taps. */
export function SignedInEffects() {
  const qc = useQueryClient();

  useEffect(() => {
    let off: (() => void) | undefined;
    // new-order pushes refresh the board immediately (realtime may lag on weak networks)
    enablePush(() => void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/partner/') }))
      .then((unsubscribe) => (off = unsubscribe))
      .catch(() => undefined); // push is best-effort; realtime + polling still work
    return () => off?.();
  }, [qc]);

  useEffect(() => onNotificationTap((data) => data.orderId && router.push(`/order/${data.orderId}`)), []);

  return null;
}
