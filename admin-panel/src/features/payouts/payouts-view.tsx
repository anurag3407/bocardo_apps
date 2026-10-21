'use client';

import { useState } from 'react';
import { Badge, Button, DataTable, ErrorNote, PageHeader, Tabs } from '@/components/ui';
import { adminPlatformMarkPaid, adminPlatformRunPayouts, useAdminPlatformPayouts } from '@/core/api/generated/admin/admin';
import type { AdminPlatformPayoutsStatus } from '@/core/api/generated/model';
import { ask, idempotency, useAction } from '@/features/common/use-action';
import { formatDateTime, formatPaise, statusTone } from '@/lib/format';

export function PayoutsView() {
  const [status, setStatus] = useState<AdminPlatformPayoutsStatus | 'all'>('pending');
  const payouts = useAdminPlatformPayouts({ status: status === 'all' ? undefined : status, limit: 100 });
  const run = useAction(() => adminPlatformRunPayouts(idempotency()));
  const markPaid = useAction((a: { id: string; providerRef: string }) => adminPlatformMarkPaid(a.id, { providerRef: a.providerRef }));

  return (
    <>
      <PageHeader
        title="Payouts"
        subtitle="Settles restaurant and rider ledger balances. Execute transfers via Razorpay Route / RazorpayX, then mark paid."
        actions={<Button loading={run.isPending} onClick={() => window.confirm('Create payouts for all positive balances up to now?') && run.mutate(undefined)}>Run payout cycle</Button>}
      />
      {run.data ? <p className="mb-3 text-sm text-success">Created {run.data.created} payouts.</p> : null}
      <Tabs value={status} onChange={setStatus} tabs={[{ key: 'pending', label: 'Pending' }, { key: 'paid', label: 'Paid' }, { key: 'failed', label: 'Failed' }, { key: 'all', label: 'All' }]} />
      <ErrorNote error={payouts.error} />
      <DataTable
        rows={payouts.data?.items}
        loading={payouts.isLoading}
        rowKey={(p) => p.id}
        columns={[
          { header: 'Payee', cell: (p) => <><div className="font-semibold">{p.accountName ?? p.accountId.slice(0, 8)}</div><div className="text-xs text-muted">{p.accountType}</div></> },
          { header: 'Amount', cell: (p) => formatPaise(p.amountPaise) },
          { header: 'Period end', cell: (p) => formatDateTime(p.periodEnd) },
          { header: 'Status', cell: (p) => <Badge tone={statusTone(p.status)}>{p.status}</Badge> },
          { header: 'Reference', cell: (p) => <span className="font-mono text-xs">{p.providerRef ?? '—'}</span> },
          { header: '', cell: (p) => (p.status === 'pending' ? <Button variant="secondary" onClick={() => { const ref = ask('Bank / RazorpayX transfer reference'); if (ref) markPaid.mutate({ id: p.id, providerRef: ref }); }}>Mark paid</Button> : null) },
        ]}
      />
    </>
  );
}
