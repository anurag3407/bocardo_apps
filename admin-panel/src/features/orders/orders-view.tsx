'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, DataTable, ErrorNote, Input, PageHeader, Tabs } from '@/components/ui';
import { useAdminOpsOrders } from '@/core/api/generated/admin/admin';
import type { AdminOpsOrdersStatus } from '@/core/api/generated/model';
import { useCityScope } from '@/features/common/city-picker';
import { formatDateTime, formatPaise, humanize, statusTone } from '@/lib/format';

const TABS: { key: AdminOpsOrdersStatus; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'failed_dispatch', label: 'No rider' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled / failed' },
  { key: 'all', label: 'All' },
];

export function OrdersView() {
  const router = useRouter();
  const { cityId, picker } = useCityScope();
  const [status, setStatus] = useState<AdminOpsOrdersStatus>('active');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(30);
  const orders = useAdminOpsOrders({ status, q: q.trim() || undefined, cityId, limit }, { query: { refetchInterval: status === 'active' ? 15_000 : false } });

  return (
    <>
      <PageHeader title="Orders" actions={<><Input placeholder="Order code or phone" value={q} onChange={(e) => setQ(e.target.value)} />{picker}</>} />
      <Tabs value={status} onChange={setStatus} tabs={TABS} />
      <ErrorNote error={orders.error} />
      <DataTable
        rows={orders.data?.items}
        loading={orders.isLoading}
        rowKey={(o) => o.id}
        onRowClick={(o) => router.push(`/orders/${o.id}`)}
        onLoadMore={orders.data?.nextCursor && limit < 100 ? () => setLimit((l) => Math.min(100, l + 30)) : undefined}
        columns={[
          { header: 'Order', cell: (o) => <span className="font-mono font-semibold">#{o.shortCode}</span> },
          { header: 'Placed', cell: (o) => formatDateTime(o.createdAt) },
          { header: 'Restaurant', cell: (o) => o.restaurant.name },
          { header: 'Customer', cell: (o) => <>{o.customerName ?? '—'}<div className="text-xs text-muted">{o.customerPhone}</div></> },
          { header: 'Items', cell: (o) => <span className="line-clamp-2 text-muted">{o.itemsPreview}</span> },
          { header: 'Total', cell: (o) => <>{formatPaise(o.totalPaise)} <span className="text-xs text-muted">{o.paymentMethod}</span></> },
          { header: 'Status', cell: (o) => <div className="flex flex-col gap-1"><Badge tone={statusTone(o.status)}>{humanize(o.status)}</Badge><span className="text-xs text-muted">{humanize(o.dispatchStatus)}</span></div> },
          { header: 'Rider', cell: (o) => o.riderName ?? '—' },
        ]}
      />
    </>
  );
}
