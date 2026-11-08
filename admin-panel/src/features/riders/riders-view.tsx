'use client';

import { useState } from 'react';
import { FileCheck } from 'lucide-react';
import { Badge, Button, DataTable, ErrorNote, Input, PageHeader, Tabs } from '@/components/ui';
import { adminAccountsCashDeposit, adminAccountsSetRiderKyc, useAdminAccountsRiders } from '@/core/api/generated/admin/admin';
import type { AdminAccountsRidersKycStatus, AdminRider } from '@/core/api/generated/model';
import { can } from '@/core/auth/claims';
import { useAdmin } from '@/core/auth/use-admin';
import { ask, useAction } from '@/features/common/use-action';
import { formatDateTime, formatPaise, statusTone } from '@/lib/format';
import { RiderReviewModal } from './rider-review-modal';

const TABS: { key: AdminAccountsRidersKycStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'Pending KYC' },
  { key: 'approved', label: 'Approved' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'all', label: 'All' },
];

export function RidersView() {
  const { role } = useAdmin();
  const [kyc, setKyc] = useState<AdminAccountsRidersKycStatus | 'all'>('pending');
  const [q, setQ] = useState('');
  const [reviewRider, setReviewRider] = useState<AdminRider | null>(null);

  const list = useAdminAccountsRiders({ kycStatus: kyc === 'all' ? undefined : kyc, q: q || undefined, limit: 100 }, { query: { refetchInterval: 30_000 } });
  const setKycAction = useAction(
    (a: { id: string; status: 'approved' | 'rejected' | 'suspended'; reason?: string }) =>
      adminAccountsSetRiderKyc(a.id, { status: a.status, reason: a.reason }),
  );
  const deposit = useAction((a: { id: string; amountPaise: number }) => adminAccountsCashDeposit(a.id, { amountPaise: a.amountPaise }));

  return (
    <>
      <PageHeader title="Riders" actions={<Input placeholder="Name or phone" value={q} onChange={(e) => setQ(e.target.value)} />} />
      <Tabs value={kyc} onChange={setKyc} tabs={TABS} />
      <ErrorNote error={list.error} />
      <DataTable
        rows={list.data?.items}
        loading={list.isLoading}
        rowKey={(r) => r.id}
        columns={[
          { header: 'Rider', cell: (r) => <><div className="font-semibold">{r.name ?? '—'}</div><div className="text-xs text-muted">{r.phone}</div></> },
          { header: 'Vehicle', cell: (r) => <span className="text-xs capitalize">{r.vehicleType} · {r.vehicleNumber ?? '—'}<br />DL {r.licenseNumber ?? '—'}</span> },
          { header: 'Status', cell: (r) => <div className="flex flex-col gap-1"><Badge tone={statusTone(r.kycStatus)}>{r.kycStatus}</Badge>{r.isOnline ? <Badge tone="success">online{r.currentOrderId ? ' · busy' : ''}</Badge> : null}</div> },
          { header: 'Quality', cell: (r) => <span className="text-xs">★ {r.ratingAvg} · accept {Math.round(r.acceptanceRate * 100)}%{r.flagsCount ? <span className="text-danger"> · {r.flagsCount} GPS flags</span> : null}</span> },
          { header: 'Cash in hand', cell: (r) => <span className={r.cashInHandPaise >= r.cashLimitPaise ? 'text-danger' : ''}>{formatPaise(r.cashInHandPaise)}</span> },
          { header: 'Last seen', cell: (r) => <span className="text-xs text-muted">{formatDateTime(r.lastSeenAt)}</span> },
          {
            header: 'Actions',
            cell: (r) => (
              <div className="flex flex-wrap gap-1">
                <Button variant="secondary" onClick={() => setReviewRider(r)}>
                  <FileCheck className="size-3.5 mr-1" />
                  Review KYC
                </Button>
                {can(role, 'ops') && r.kycStatus !== 'approved' ? (
                  <Button onClick={() => setKycAction.mutate({ id: r.id, status: 'approved' })}>Approve</Button>
                ) : null}
                {can(role, 'finance', 'ops') && r.cashInHandPaise > 0 ? (
                  <Button variant="secondary" onClick={() => { const amount = ask('Cash deposited (₹)', String(r.cashInHandPaise / 100)); if (amount) deposit.mutate({ id: r.id, amountPaise: Math.round(Number(amount) * 100) }); }}>Cash deposit</Button>
                ) : null}
              </div>
            ),
          },
        ]}
      />

      <RiderReviewModal
        rider={reviewRider}
        onClose={() => setReviewRider(null)}
        onApprove={(id) => {
          setKycAction.mutate({ id, status: 'approved' }, { onSuccess: () => setReviewRider(null) });
        }}
        onReject={(id, reason) => {
          setKycAction.mutate({ id, status: 'rejected', reason }, { onSuccess: () => setReviewRider(null) });
        }}
        onSuspend={(id, reason) => {
          setKycAction.mutate({ id, status: 'suspended', reason }, { onSuccess: () => setReviewRider(null) });
        }}
        loading={setKycAction.isPending}
      />
    </>
  );
}
