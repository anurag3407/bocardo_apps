'use client';

import { useState } from 'react';
import { Eye, ShieldCheck } from 'lucide-react';
import { Badge, Button, DataTable, ErrorNote, Input, PageHeader, Tabs } from '@/components/ui';
import {
  adminAccountsSetRestaurantStatus,
  adminAccountsSetRestaurantTerms,
  useAdminAccountsRestaurants,
} from '@/core/api/generated/admin/admin';
import type { AdminAccountsRestaurantsStatus, AdminRestaurant } from '@/core/api/generated/model';
import { can } from '@/core/auth/claims';
import { useAdmin } from '@/core/auth/use-admin';
import { ask, useAction } from '@/features/common/use-action';
import { statusTone } from '@/lib/format';
import { RestaurantReviewModal } from './restaurant-review-modal';

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
  const [inspecting, setInspecting] = useState<AdminRestaurant | null>(null);

  const list = useAdminAccountsRestaurants({
    status: status === 'all' ? undefined : status,
    q: q || undefined,
    limit: 100,
  });

  const setStatusAction = useAction(
    (a: { id: string; status: 'active' | 'suspended' | 'rejected'; reason?: string }) =>
      adminAccountsSetRestaurantStatus(a.id, { status: a.status, reason: a.reason }).then((res) => {
        setInspecting((curr) => (curr?.id === a.id ? res : curr));
        return res;
      }),
  );

  const setTerms = useAction(
    (a: { id: string; commissionBps?: number; deliveryRadiusM?: number }) =>
      adminAccountsSetRestaurantTerms(a.id, a).then((res) => {
        setInspecting((curr) => (curr?.id === a.id ? res : curr));
        return res;
      }),
  );

  const editTerms = (r: AdminRestaurant) => {
    const commission = ask('Commission %', String(r.commissionBps / 100));
    if (commission === null) return;
    const radius = ask('Delivery radius (km)', String(r.deliveryRadiusM / 1000));
    if (radius === null) return;
    setTerms.mutate({
      id: r.id,
      commissionBps: Math.round(Number(commission) * 100),
      deliveryRadiusM: Math.round(Number(radius) * 1000),
    });
  };

  const handleApprove = (id: string) => {
    if (confirm('Approve this restaurant and activate its outlet for customer orders?')) {
      setStatusAction.mutate({ id, status: 'active' });
    }
  };

  const handleReject = (id: string, reason: string) => {
    setStatusAction.mutate({ id, status: 'rejected', reason });
  };

  const handleSuspend = (id: string, reason: string) => {
    setStatusAction.mutate({ id, status: 'suspended', reason });
  };

  return (
    <>
      <PageHeader
        title="Restaurants"
        actions={
          <Input
            placeholder="Search by restaurant name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        }
      />
      <Tabs value={status} onChange={setStatus} tabs={TABS} />
      <ErrorNote error={list.error} />
      <DataTable
        rows={list.data?.items}
        loading={list.isLoading}
        rowKey={(r) => r.id}
        columns={[
          {
            header: 'Restaurant',
            cell: (r) => (
              <div>
                <div className="font-semibold text-text">{r.name}</div>
                <div className="text-xs text-muted">{r.cuisines.join(', ')}</div>
                {r.ownerName ? (
                  <div className="text-xs text-muted/80 mt-0.5">
                    Owner: {r.ownerName} {r.phone ? `(${r.phone})` : ''}
                  </div>
                ) : null}
              </div>
            ),
          },
          {
            header: 'Address',
            cell: (r) => <span className="text-xs text-muted max-w-[180px] block truncate">{r.addressLine}</span>,
          },
          {
            header: 'Compliance (FSSAI/GST)',
            cell: (r) => (
              <div className="text-xs space-y-0.5">
                <div className="flex items-center gap-1 font-mono">
                  <ShieldCheck className="size-3 text-muted" />
                  <span>FSSAI: {r.fssaiLicense ?? '—'}</span>
                </div>
                {r.fssaiExpiryDate ? (
                  <div className="text-[11px] text-muted">Exp: {r.fssaiExpiryDate}</div>
                ) : null}
                <div className="text-[11px] text-muted truncate max-w-[140px]">
                  PAN: {r.panNumber ?? '—'} · GST: {r.gstin ?? 'Exempt'}
                </div>
              </div>
            ),
          },
          {
            header: 'Settlement Account',
            cell: (r) => (
              <div className="text-xs space-y-0.5">
                <div className="font-medium text-text truncate max-w-[150px]">
                  {r.bankBeneficiaryName ?? '—'}
                </div>
                <div className="text-[11px] text-muted font-mono">
                  {r.bankName ?? 'Bank'} ({r.bankAccountNumber ? `••${r.bankAccountNumber.slice(-4)}` : '—'})
                </div>
                <div className="text-[11px] text-muted font-mono">IFSC: {r.bankIfsc ?? '—'}</div>
              </div>
            ),
          },
          {
            header: 'Terms',
            cell: (r) => (
              <span className="text-xs">
                {r.commissionBps / 100}% · {r.deliveryRadiusM / 1000} km
              </span>
            ),
          },
          {
            header: 'Rating',
            cell: (r) => (r.ratingCount ? `★ ${r.ratingAvg} (${r.ratingCount})` : '—'),
          },
          {
            header: 'Status',
            cell: (r) => (
              <div className="flex flex-col gap-1 items-start">
                <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                {r.status === 'active' ? (
                  <span className="text-xs text-muted">{r.isOpen ? 'open' : 'closed'}</span>
                ) : null}
                {r.rejectionReason && (r.status === 'rejected' || r.status === 'suspended') ? (
                  <span
                    className="text-[11px] text-danger truncate max-w-[140px] block"
                    title={r.rejectionReason}
                  >
                    {r.rejectionReason}
                  </span>
                ) : null}
              </div>
            ),
          },
          {
            header: 'Actions',
            cell: (r) => (
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  variant="secondary"
                  onClick={() => setInspecting(r)}
                  className="gap-1 text-xs h-7 px-2"
                >
                  <Eye className="size-3" /> Review
                </Button>
                {can(role, 'ops') ? (
                  <>
                    {r.status !== 'active' ? (
                      <Button
                        onClick={() => handleApprove(r.id)}
                        className="text-xs h-7 px-2"
                      >
                        Approve
                      </Button>
                    ) : null}
                    {r.status === 'pending' ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          const reason = ask('Rejection / correction reason');
                          if (reason) setStatusAction.mutate({ id: r.id, status: 'rejected', reason });
                        }}
                        className="text-xs h-7 px-2"
                      >
                        Reject
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      onClick={() => editTerms(r)}
                      className="text-xs h-7 px-2"
                    >
                      Terms
                    </Button>
                  </>
                ) : null}
              </div>
            ),
          },
        ]}
      />

      {/* Comprehensive Verification & KYC Review Modal */}
      <RestaurantReviewModal
        restaurant={inspecting}
        onClose={() => setInspecting(null)}
        onApprove={handleApprove}
        onReject={handleReject}
        onSuspend={handleSuspend}
        onEditTerms={editTerms}
        loading={setStatusAction.isPending}
      />
    </>
  );
}
