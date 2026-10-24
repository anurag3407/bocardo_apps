'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, DataTable, ErrorNote, PageHeader, Tabs } from '@/components/ui';
import { adminPlatformUpdateTicket, useAdminPlatformTickets } from '@/core/api/generated/admin/admin';
import type { AdminPlatformTicketsStatus, SupportTicket } from '@/core/api/generated/model';
import { ask, useAction } from '@/features/common/use-action';
import { formatDateTime, formatPaise, humanize, statusTone } from '@/lib/format';

export function TicketsView() {
  const [status, setStatus] = useState<AdminPlatformTicketsStatus>('open');
  const tickets = useAdminPlatformTickets({ status, limit: 100 });
  const update = useAction((a: { id: string; body: Parameters<typeof adminPlatformUpdateTicket>[1] }) => adminPlatformUpdateTicket(a.id, a.body));

  const resolve = (t: SupportTicket, withRefund: boolean) => {
    const refundRupees = withRefund ? ask('Refund amount (₹)') : null;
    if (withRefund && !refundRupees) return;
    const resolution = ask('Resolution note (sent to the user)');
    if (!resolution) return;
    update.mutate({ id: t.id, body: { status: 'resolved', resolution, ...(refundRupees ? { refundPaise: Math.round(Number(refundRupees) * 100) } : {}) } });
  };

  return (
    <>
      <PageHeader title="Support tickets" />
      <Tabs value={status} onChange={setStatus} tabs={[{ key: 'open', label: 'Open' }, { key: 'in_progress', label: 'In progress' }, { key: 'resolved', label: 'Resolved' }, { key: 'closed', label: 'Closed' }]} />
      <ErrorNote error={tickets.error} />
      <DataTable
        rows={tickets.data?.items}
        loading={tickets.isLoading}
        rowKey={(t) => t.id}
        columns={[
          { header: 'Opened', cell: (t) => formatDateTime(t.createdAt) },
          { header: 'From', cell: (t) => <Badge>{t.app}</Badge> },
          { header: 'Issue', cell: (t) => <><div className="font-semibold">{humanize(t.category)}</div><div className="max-w-md text-xs text-muted">{t.description}</div></> },
          { header: 'Order', cell: (t) => (t.orderId ? <Link className="font-semibold text-brand-text hover:underline" href={`/orders/${t.orderId}`}>view</Link> : '—') },
          { header: 'Status', cell: (t) => <div className="flex flex-col gap-1"><Badge tone={statusTone(t.status)}>{humanize(t.status)}</Badge>{t.refundPaise ? <span className="text-xs">refunded {formatPaise(t.refundPaise)}</span> : null}</div> },
          {
            header: '',
            cell: (t) =>
              t.status === 'open' || t.status === 'in_progress' ? (
                <div className="flex flex-wrap gap-1">
                  {t.status === 'open' ? <Button variant="ghost" onClick={() => update.mutate({ id: t.id, body: { status: 'in_progress', assignToMe: true } })}>Take</Button> : null}
                  <Button variant="secondary" onClick={() => resolve(t, false)}>Resolve</Button>
                  {t.orderId ? <Button onClick={() => resolve(t, true)}>Refund & resolve</Button> : null}
                </div>
              ) : (
                <span className="text-xs text-muted">{t.resolution}</span>
              ),
          },
        ]}
      />
    </>
  );
}
