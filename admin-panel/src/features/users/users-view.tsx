'use client';

import { useState } from 'react';
import { Badge, Button, DataTable, ErrorNote, Input, PageHeader } from '@/components/ui';
import { adminAccountsBlock, useAdminAccountsUsers } from '@/core/api/generated/admin/admin';
import { ask, useAction } from '@/features/common/use-action';
import { formatDateTime } from '@/lib/format';

export function UsersView() {
  const [q, setQ] = useState('');
  const users = useAdminAccountsUsers({ q: q || undefined, limit: 50 });
  const block = useAction((a: { id: string; blocked: boolean; reason?: string }) => adminAccountsBlock(a.id, { blocked: a.blocked, reason: a.reason }));

  return (
    <>
      <PageHeader title="Customers & accounts" actions={<Input placeholder="Name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} />} />
      <ErrorNote error={users.error} />
      <DataTable
        rows={users.data?.items}
        loading={users.isLoading}
        rowKey={(u) => u.id}
        columns={[
          { header: 'Name', cell: (u) => u.fullName ?? '—' },
          { header: 'Contact', cell: (u) => <span className="text-xs">{u.phone ?? ''}<br />{u.email ?? ''}</span> },
          { header: 'Roles', cell: (u) => <div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r}>{r}</Badge>)}{u.adminRole ? <Badge tone="brand">{u.adminRole}</Badge> : null}</div> },
          { header: 'Orders', cell: (u) => u.orderCount },
          { header: 'Joined', cell: (u) => formatDateTime(u.createdAt) },
          {
            header: '',
            cell: (u) =>
              u.isBlocked ? (
                <Button variant="ghost" onClick={() => block.mutate({ id: u.id, blocked: false })}>Unblock</Button>
              ) : (
                <Button variant="danger" onClick={() => { const reason = ask('Why block this account? (fraud, abuse…)'); if (reason) block.mutate({ id: u.id, blocked: true, reason }); }}>Block</Button>
              ),
          },
        ]}
      />
    </>
  );
}
