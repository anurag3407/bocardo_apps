import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { refreshClaims } from '@/core/auth/auth-actions';
import { enablePush, onNotificationTap, type PushData } from '@/core/notifications/push';

/** Push registration; any rider push (offer, reassignment, ready, KYC) refreshes duty state. */
export function SignedInEffects() {
  const qc = useQueryClient();

  useEffect(() => {
    const refresh = (data: PushData) => {
      if (data.type === 'account_status') void refreshClaims();
      void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/rider/') });
    };
    let off: (() => void) | undefined;
    enablePush(refresh)
      .then((unsubscribe) => (off = unsubscribe))
      .catch(() => undefined);
    const offTap = onNotificationTap((data) => {
      refresh(data);
      if (data.offerId || data.orderId) router.push('/(tabs)');
    });
    return () => {
      off?.();
      offTap();
    };
  }, [qc]);

  return null;
}
