'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/core/auth/supabase-browser';

/** Private Supabase broadcast channel (admin:* topics are restricted to admins by RLS). */
export function useRealtime(topic: string | null, onMessage: (event: string, payload: Record<string, unknown>) => void) {
  const handler = useRef(onMessage);
  useEffect(() => {
    handler.current = onMessage;
  });
  useEffect(() => {
    if (!topic) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(topic, { config: { private: true } })
        .on('broadcast', { event: '*' }, (m) => handler.current(m.event, (m.payload ?? {}) as Record<string, unknown>))
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [topic]);
}
