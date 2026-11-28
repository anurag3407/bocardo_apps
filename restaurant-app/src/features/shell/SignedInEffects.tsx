import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { refreshClaims } from '@/core/auth/auth-actions';
import { enablePush, onNotificationTap, type PushData } from '@/core/notifications/push';

/** Side effects that only make sense with a session: push registration + deep links from taps. */
export function SignedInEffects() {
  const qc = useQueryClient();

  useEffect(() => {
    const handle = (data: PushData) => {
      if (data.type === 'account_status') void refreshClaims();
      void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/partner/') });
    };
    let off: (() => void) | undefined;
    // new-order pushes refresh the board immediately (realtime may lag on weak networks)
    enablePush(handle)
      .then((unsubscribe) => (off = unsubscribe))
      .catch(() => undefined); // push is best-effort; realtime + polling still work
    const offTap = onNotificationTap((data) => {
      handle(data);
      if (data.orderId) router.push(`/order/${data.orderId}`);
    });
    return () => {
      off?.();
      offTap();
    };
  }, [qc]);

  return null;
}
