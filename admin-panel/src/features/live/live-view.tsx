'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, Card, ErrorNote, PageHeader } from '@/components/ui';
import { useAdminOpsLiveMap } from '@/core/api/generated/admin/admin';
import { useCityScope } from '@/features/common/city-picker';
import { MapView, type MapPoint } from '@/features/common/mapbox-map';
import { useRealtime } from '@/features/common/use-realtime';
import { formatDateTime, humanize } from '@/lib/format';

interface Alert {
  id: string;
  event: string;
  payload: Record<string, unknown>;
  at: string;
}

const ALERT_LABEL: Record<string, string> = {
  dispatch_failed: 'No rider found',
  rider_stale: 'Rider stopped sending location',
  rider_sos: '🚨 Rider SOS',
  otp_budget_exhausted: '⚠️ OTP hourly budget exhausted — possible SMS pumping attack',
};

/** Live ops: every active order and online rider on one map, plus a realtime alert feed. */
export function LiveView() {
  const { cityId, picker, cities } = useCityScope();
  const live = useAdminOpsLiveMap({ cityId }, { query: { refetchInterval: 10_000 } });
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // one channel per city; "all cities" listens to every city's channel via the first few
  const topic = cityId ? `admin:ops:${cityId}` : cities[0] ? `admin:ops:${cities[0].id}` : null;
  const pushAlert = (event: string, payload: Record<string, unknown>) =>
    setAlerts((a) => [{ id: `${Date.now()}-${Math.random()}`, event, payload, at: new Date().toISOString() }, ...a].slice(0, 50));
  useRealtime(topic, pushAlert);
  useRealtime('admin:security', pushAlert);

  const points = useMemo<MapPoint[]>(() => {
    if (!live.data) return [];
    return [
      ...live.data.riders.map((r) => ({ id: `r-${r.id}`, lat: r.lat, lng: r.lng, color: r.busy ? '#ff5a1f' : '#1ba672', label: `${r.name ?? 'Rider'} · ${r.busy ? 'on delivery' : 'idle'}` })),
      ...live.data.orders
        .filter((o) => o.dispatchStatus === 'SEARCHING' || o.dispatchStatus === 'FAILED' || o.dispatchStatus === 'UNASSIGNED')
        .map((o) => ({ id: `o-${o.id}`, lat: o.pickup.lat, lng: o.pickup.lng, color: o.dispatchStatus === 'FAILED' ? '#e23744' : '#c98200', label: `#${o.shortCode} · ${humanize(o.dispatchStatus)}` })),
    ];
  }, [live.data]);

  return (
    <>
      <PageHeader title="Live ops" subtitle="Green: idle rider · orange: rider on delivery · amber/red: order waiting for a rider" actions={picker} />
      <ErrorNote error={live.error} />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <MapView points={points} height={560} />
        <div className="flex flex-col gap-4">
          <Card title={`Alerts (${alerts.length})`}>
            {alerts.length ? (
              <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto text-sm">
                {alerts.map((a) => (
                  <li key={a.id} className="border-b border-border pb-2 last:border-0">
                    <div className="font-semibold">{ALERT_LABEL[a.event] ?? a.event}</div>
                    <div className="text-xs text-muted">
                      {a.payload.orderId ? <Link className="text-brand" href={`/orders/${a.payload.orderId}`}>#{String(a.payload.shortCode ?? 'order')}</Link> : null} · {formatDateTime(a.at)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No alerts. Dispatch failures, silent riders and SOS appear here instantly.</p>
            )}
          </Card>
          <Card title={`Active orders (${live.data?.orders.length ?? 0})`}>
            <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto text-sm">
              {live.data?.orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2">
                  <Link href={`/orders/${o.id}`} className="text-brand">#{o.shortCode}</Link>
                  <Badge tone={o.dispatchStatus === 'FAILED' ? 'danger' : 'neutral'}>{humanize(o.status)} · {humanize(o.dispatchStatus)}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
