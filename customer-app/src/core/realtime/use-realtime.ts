import { useEffect, useRef } from 'react';
import { supabase } from '../auth/supabase';

type Handler = (event: string, payload: Record<string, unknown>) => void;

/**
 * Subscribes to a private Supabase broadcast channel (`order:<id>`, `rider:<id>` …).
 * Topic access is enforced by RLS on realtime.messages. Screens should also poll as a
 * fallback, since realtime is best-effort on mobile networks.
 */
export function useRealtime(topic: string | null | undefined, onMessage: Handler) {
  const handler = useRef(onMessage);
  useEffect(() => {
    handler.current = onMessage;
  });

  useEffect(() => {
    if (!topic) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(topic, { config: { private: true } })
        .on('broadcast', { event: '*' }, (msg) => handler.current(msg.event, (msg.payload ?? {}) as Record<string, unknown>))
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [topic]);
}
