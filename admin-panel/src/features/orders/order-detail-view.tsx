'use client';

import Link from 'next/link';
import { Badge, Button, Card, DataTable, ErrorNote, PageHeader } from '@/components/ui';
import { adminOpsCancel, adminOpsReassign, adminOpsRefund, useAdminOpsOrder } from '@/core/api/generated/admin/admin';
import { can } from '@/core/auth/claims';
import { useAdmin } from '@/core/auth/use-admin';
import { ask, idempotency, useAction } from '@/features/common/use-action';
import { MapView } from '@/features/common/mapbox-map';
import { formatDateTime, formatPaise, humanize, statusTone } from '@/lib/format';

export function OrderDetailView({ id }: { id: string }) {
  const { role } = useAdmin();
  const order = useAdminOpsOrder(id, { query: { refetchInterval: 15_000 } });
  const cancel = useAction((reason: string) => adminOpsCancel(id, { reason }, idempotency()));
  const reassign = useAction((reason: string) => adminOpsReassign(id, { reason }, idempotency()));
  const refund = useAction((a: { amountPaise: number; reason: string }) => adminOpsRefund(id, a, idempotency()));

  if (order.error) return <ErrorNote error={order.error} />;
  const o = order.data;
  if (!o) return <p className="text-muted">Loading…</p>;

  const cancellable = ['PAYMENT_PENDING', 'PLACED', 'ACCEPTED', 'READY'].includes(o.status);
  const reassignable = ['ACCEPTED', 'READY'].includes(o.status) && !['PICKED', 'AT_DROP', 'DONE'].includes(o.dispatchStatus);

  const doRefund = () => {
    const rupees = ask('Refund amount in ₹');
    if (!rupees) return;
    const reason = ask('Reason (shared with finance)');
    if (!reason) return;
    refund.mutate({ amountPaise: Math.round(Number(rupees) * 100), reason });
  };

  return (
    <>
      <PageHeader
        title={`Order #${o.shortCode}`}
        subtitle={`${formatDateTime(o.createdAt)} · ${o.restaurant.name}`}
        actions={
          <>
            {reassignable && can(role, 'ops') ? <Button variant="secondary" loading={reassign.isPending} onClick={() => { const r = ask('Why reassign?', 'Rider not moving'); if (r) reassign.mutate(r); }}>Reassign rider</Button> : null}
            {o.paymentMethod === 'online' && o.paymentStatus !== 'refunded' && can(role, 'support', 'finance') ? <Button variant="ghost" loading={refund.isPending} onClick={doRefund}>Refund</Button> : null}
            {cancellable && can(role, 'ops', 'support') ? <Button variant="danger" loading={cancel.isPending} onClick={() => { const r = ask('Cancellation reason (customer sees this)'); if (r) cancel.mutate(r); }}>Cancel order</Button> : null}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={statusTone(o.status)}>{humanize(o.status)}</Badge>
        <Badge>{humanize(o.dispatchStatus)}</Badge>
        <Badge tone={o.paymentMethod === 'cod' ? 'warning' : 'success'}>{o.paymentMethod} · {humanize(o.paymentStatus)}</Badge>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="People">
          <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm">
            <dt className="text-muted">Customer</dt><dd>{o.customer.name} · {o.customer.phone}</dd>
            <dt className="text-muted">Deliver to</dt><dd>{[o.deliveryAddress.line1, o.deliveryAddress.line2, o.deliveryAddress.landmark].filter(Boolean).join(', ')}</dd>
            <dt className="text-muted">Restaurant</dt><dd>{o.restaurant.name} · {o.restaurant.phone}</dd>
            <dt className="text-muted">Rider</dt><dd>{o.rider ? <Link className="text-brand" href={`/riders?q=${encodeURIComponent(o.rider.name ?? '')}`}>{o.rider.name} · {o.rider.vehicleNumber ?? ''}</Link> : '—'}</dd>
            <dt className="text-muted">ETA</dt><dd>{formatDateTime(o.estimatedDeliveryAt)}</dd>
            {o.cancelReason ? <><dt className="text-muted">Cancelled</dt><dd className="text-danger">{o.cancelReason} ({o.cancelledBy})</dd></> : null}
          </dl>
        </Card>
        <MapView
          height={260}
          center={{ lat: o.restaurant.lat, lng: o.restaurant.lng }}
          zoom={12}
          points={[
            { id: 'r', lat: o.restaurant.lat, lng: o.restaurant.lng, color: '#ff5a1f', label: o.restaurant.name },
            { id: 'c', lat: o.deliveryAddress.lat, lng: o.deliveryAddress.lng, color: '#14151a', label: 'Customer' },
            ...(o.rider?.lat && o.rider.lng ? [{ id: 'rd', lat: o.rider.lat, lng: o.rider.lng, color: '#1ba672', label: o.rider.name ?? 'Rider' }] : []),
          ]}
        />
        <Card title="Bill">
          <ul className="text-sm">
            {o.items.map((i, idx) => <li key={idx} className="flex justify-between"><span>{i.quantity} × {i.name}{i.variantName ? ` (${i.variantName})` : ''}</span><span>{formatPaise(i.lineTotalPaise)}</span></li>)}
          </ul>
          <dl className="mt-3 grid grid-cols-2 gap-y-1 border-t border-border pt-2 text-sm">
            <dt className="text-muted">Items</dt><dd className="text-right">{formatPaise(o.pricing.itemTotalPaise)}</dd>
            <dt className="text-muted">Delivery</dt><dd className="text-right">{formatPaise(o.pricing.deliveryFeePaise)}</dd>
            <dt className="text-muted">Fees + tax</dt><dd className="text-right">{formatPaise(o.pricing.platformFeePaise + o.pricing.packagingFeePaise + o.pricing.taxPaise)}</dd>
            <dt className="text-muted">Discount</dt><dd className="text-right">−{formatPaise(o.pricing.discountPaise)}</dd>
            <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{formatPaise(o.pricing.totalPaise)}</dd>
          </dl>
        </Card>
        <Card title="Payments & refunds">
          {o.payments.map((p) => <div key={p.id} className="text-sm">{p.provider} · {p.providerPaymentId ?? p.providerOrderId} · {formatPaise(p.amountPaise)} · <Badge tone={statusTone(p.status)}>{p.status}</Badge></div>)}
          {o.refunds.map((r) => <div key={r.id} className="text-sm text-muted">Refund {formatPaise(r.amountPaise)} · {r.reason} · <Badge tone={statusTone(r.status)}>{r.status}</Badge>{r.lastError ? ` · ${r.lastError}` : ''}</div>)}
          {!o.payments.length && !o.refunds.length ? <p className="text-sm text-muted">Cash on delivery</p> : null}
        </Card>
      </div>
      <h2 className="mb-2 mt-6 text-sm font-semibold">Event log</h2>
      <DataTable
        rows={[...o.events].reverse()}
        rowKey={(e) => String(e.id)}
        columns={[
          { header: 'When', cell: (e) => formatDateTime(e.at) },
          { header: 'Event', cell: (e) => <span className="font-mono text-xs">{e.event}</span> },
          { header: 'Actor', cell: (e) => e.actorType },
          { header: 'Details', cell: (e) => <code className="text-xs text-muted">{Object.keys(e.metadata).length ? JSON.stringify(e.metadata) : ''}</code> },
        ]}
      />
      {o.deliveryProofUrl ? (
        <Card title="Proof of delivery" className="mt-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from Supabase Storage */}
          <img src={o.deliveryProofUrl} alt="Doorstep photo taken by the rider" className="max-h-80 rounded-lg" />
          <p className="mt-2 text-xs text-muted">
            {o.deliveryProofLat && o.deliveryProofLng
              ? `Taken at ${o.deliveryProofLat.toFixed(5)}, ${o.deliveryProofLng.toFixed(5)} (drop pin ${o.deliveryAddress.lat.toFixed(5)}, ${o.deliveryAddress.lng.toFixed(5)})`
              : 'No GPS attached'}
          </p>
        </Card>
      ) : null}
      <h2 className="mb-2 mt-6 text-sm font-semibold">Masked calls</h2>
      <DataTable
        rows={o.calls}
        rowKey={(c) => c.id}
        empty="No calls on this order"
        columns={[
          { header: 'When', cell: (c) => formatDateTime(c.createdAt) },
          { header: 'From → to', cell: (c) => `${c.callerRole} → ${c.calleeRole}` },
          { header: 'Provider', cell: (c) => c.provider },
          { header: 'Status', cell: (c) => <Badge tone={statusTone(c.status)}>{c.status}</Badge> },
          { header: 'Duration', cell: (c) => (c.durationSeconds !== null ? `${c.durationSeconds}s` : '—') },
        ]}
      />
      <h2 className="mb-2 mt-6 text-sm font-semibold">Rider offers</h2>
      <DataTable
        rows={o.offers}
        rowKey={(f) => f.id}
        empty="No offers sent yet"
        columns={[
          { header: 'When', cell: (f) => formatDateTime(f.createdAt) },
          { header: 'Rider', cell: (f) => f.riderName ?? f.riderId.slice(0, 8) },
          { header: 'Score', cell: (f) => f.score.toFixed(3) },
          { header: 'Distance', cell: (f) => `${(f.distanceM / 1000).toFixed(1)} km` },
          { header: 'Payout', cell: (f) => formatPaise(f.payoutPaise) },
          { header: 'Status', cell: (f) => <Badge tone={statusTone(f.status)}>{f.status}</Badge> },
        ]}
      />
    </>
  );
}
