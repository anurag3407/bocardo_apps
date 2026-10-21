'use client';

import { useState } from 'react';
import { Badge, Button, DataTable, ErrorNote, Input, PageHeader, Tabs } from '@/components/ui';
import { adminAccountsSetRestaurantStatus, adminAccountsSetRestaurantTerms, useAdminAccountsRestaurants } from '@/core/api/generated/admin/admin';
import type { AdminAccountsRestaurantsStatus, AdminRestaurant } from '@/core/api/generated/model';
import { can } from '@/core/auth/claims';
import { useAdmin } from '@/core/auth/use-admin';
import { ask, useAction } from '@/features/common/use-action';
import { formatDateTime, statusTone } from '@/lib/format';

const TABS: { key: AdminAccountsRestaurantsStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'Pending review' },
  { key: 'active', label: 'Active' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

export function RestaurantsView() {
  const { role } = useAdmin();
  const [status, setStatus] = useState<AdminAccountsRestaurantsStatus | 'all'>('pending');
  const [q, setQ] = useState('');
  const list = useAdminAccountsRestaurants({ status: status === 'all' ? undefined : status, q: q || undefined, limit: 100 });
  const setStatusAction = useAction((a: { id: string; status: 'active' | 'suspended' | 'rejected'; reason?: string }) => adminAccountsSetRestaurantStatus(a.id, { status: a.status, reason: a.reason }));
  const setTerms = useAction((a: { id: string; commissionBps?: number; deliveryRadiusM?: number }) => adminAccountsSetRestaurantTerms(a.id, a));

  const editTerms = (r: AdminRestaurant) => {
    const commission = ask('Commission %', String(r.commissionBps / 100));
    if (commission === null) return;
    const radius = ask('Delivery radius (km)', String(r.deliveryRadiusM / 1000));
    if (radius === null) return;
    setTerms.mutate({ id: r.id, commissionBps: Math.round(Number(commission) * 100), deliveryRadiusM: Math.round(Number(radius) * 1000) });
  };

  return (
    <>
      <PageHeader title="Restaurants" actions={<Input placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />} />
      <Tabs value={status} onChange={setStatus} tabs={TABS} />
      <ErrorNote error={list.error} />
      <DataTable
        rows={list.data?.items}
        loading={list.isLoading}
        rowKey={(r) => r.id}
        columns={[
          { header: 'Restaurant', cell: (r) => <><div className="font-semibold">{r.name}</div><div className="text-xs text-muted">{r.cuisines.join(', ')}</div></> },
          { header: 'Address', cell: (r) => <span className="text-muted">{r.addressLine}</span> },
          { header: 'Licences', cell: (r) => <span className="text-xs">FSSAI {r.fssaiLicense ?? '—'}<br />GST {r.gstin ?? '—'}</span> },
          { header: 'Terms', cell: (r) => <span className="text-xs">{r.commissionBps / 100}% · {r.deliveryRadiusM / 1000} km</span> },
          { header: 'Rating', cell: (r) => (r.ratingCount ? `★ ${r.ratingAvg} (${r.ratingCount})` : '—') },
          { header: 'Device', cell: (r) => <span className="text-xs text-muted">{r.lastHeartbeatAt ? `seen ${formatDateTime(r.lastHeartbeatAt)}` : 'never'}</span> },
          { header: 'Status', cell: (r) => <div className="flex flex-col gap-1"><Badge tone={statusTone(r.status)}>{r.status}</Badge>{r.status === 'active' ? <span className="text-xs text-muted">{r.isOpen ? 'open' : 'closed'}</span> : null}</div> },
          {
            header: 'Actions',
            cell: (r) =>
              can(role, 'ops') ? (
                <div className="flex flex-wrap gap-1">
                  {r.status !== 'active' ? <Button onClick={() => setStatusAction.mutate({ id: r.id, status: 'active' })}>Approve</Button> : null}
                  {r.status === 'pending' ? <Button variant="ghost" onClick={() => { const reason = ask('Rejection reason'); if (reason) setStatusAction.mutate({ id: r.id, status: 'rejected', reason }); }}>Reject</Button> : null}
                  {r.status === 'active' ? <Button variant="danger" onClick={() => { const reason = ask('Suspension reason'); if (reason) setStatusAction.mutate({ id: r.id, status: 'suspended', reason }); }}>Suspend</Button> : null}
                  <Button variant="ghost" onClick={() => editTerms(r)}>Terms</Button>
                </div>
              ) : null,
          },
        ]}
      />
    </>
  );
}
