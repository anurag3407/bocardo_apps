'use client';

import { DataTable, ErrorNote, PageHeader } from '@/components/ui';
import { useAdminPlatformAuditLogs } from '@/core/api/generated/admin/admin';
import { formatDateTime } from '@/lib/format';

export function AuditView() {
  const logs = useAdminPlatformAuditLogs({ limit: 100 });
  return (
    <>
      <PageHeader title="Audit log" subtitle="Every privileged change, who made it and what changed" />
      <ErrorNote error={logs.error} />
      <DataTable
        rows={logs.data?.items}
        loading={logs.isLoading}
        rowKey={(l) => String(l.id)}
        columns={[
          { header: 'When', cell: (l) => formatDateTime(l.createdAt) },
          { header: 'Who', cell: (l) => l.actorName ?? l.actorId?.slice(0, 8) ?? 'system' },
          { header: 'Action', cell: (l) => <span className="font-mono text-xs">{l.action}</span> },
          { header: 'Entity', cell: (l) => <span className="text-xs">{l.entityType} {l.entityId?.slice(0, 8)}</span> },
          { header: 'Change', cell: (l) => <code className="block max-w-lg truncate text-xs text-muted">{JSON.stringify({ before: l.before, after: l.after })}</code> },
        ]}
      />
    </>
  );
}
