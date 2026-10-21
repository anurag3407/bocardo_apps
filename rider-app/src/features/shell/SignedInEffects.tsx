import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { enablePush, onNotificationTap } from '@/core/notifications/push';

/** Push registration; any rider push (offer, reassignment, ready) refreshes duty state. */
export function SignedInEffects() {
  const qc = useQueryClient();

  useEffect(() => {
    const refresh = () => void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/rider/') });
    let off: (() => void) | undefined;
    enablePush(refresh)
      .then((unsubscribe) => (off = unsubscribe))
      .catch(() => undefined);
    const offTap = onNotificationTap(refresh);
    return () => {
      off?.();
      offTap();
    };
  }, [qc]);

  return null;
}
