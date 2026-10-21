'use client';

import { useState } from 'react';
import { Button, Card, ErrorNote, Input, PageHeader, Select, Textarea } from '@/components/ui';
import { adminAccountsGrantAdmin, adminPlatformSetAppConfig, useAdminPlatformAppConfig } from '@/core/api/generated/admin/admin';
import type { GrantAdminDtoAdminRole } from '@/core/api/generated/model';
import { useAction } from '@/features/common/use-action';

/** super_admin only: remote config (forced update, dispatch tuning) and console access. */
export function SettingsView() {
  const config = useAdminPlatformAppConfig();
  const save = useAction((a: { key: string; value: unknown }) => adminPlatformSetAppConfig(a.key, { value: a.value }));
  const grant = useAction(adminAccountsGrantAdmin);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [invite, setInvite] = useState({ email: '', role: 'ops' });

  return (
    <>
      <PageHeader title="Settings" />
      <ErrorNote error={config.error} />
      <div className="grid gap-4 lg:grid-cols-2">
        {config.data?.map((entry) => {
          const draft = drafts[entry.key] ?? JSON.stringify(entry.value, null, 2);
          let parsed: unknown = undefined;
          try {
            parsed = JSON.parse(draft);
          } catch {}
          return (
            <Card key={entry.key} title={entry.key} actions={<Button disabled={parsed === undefined || !(entry.key in drafts)} loading={save.isPending} onClick={() => save.mutate({ key: entry.key, value: parsed })}>Save</Button>}>
              <Textarea rows={6} value={draft} onChange={(e) => setDrafts((d) => ({ ...d, [entry.key]: e.target.value }))} />
              {parsed === undefined ? <p className="mt-1 text-xs text-danger">Invalid JSON</p> : null}
            </Card>
          );
        })}
        <Card title="Console access">
          <div className="flex flex-col gap-2">
            <Input label="User email (they must have signed in once)" value={invite.email} onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))} />
            <Select
              label="Role"
              value={invite.role}
              onChange={(e) => setInvite((i) => ({ ...i, role: e.target.value }))}
              options={[{ value: 'ops', label: 'Ops' }, { value: 'support', label: 'Support' }, { value: 'finance', label: 'Finance' }, { value: 'super_admin', label: 'Super admin' }, { value: 'none', label: 'Revoke access' }]}
            />
            <Button loading={grant.isPending} disabled={!invite.email} onClick={() => grant.mutate({ email: invite.email, adminRole: invite.role === 'none' ? null : (invite.role as GrantAdminDtoAdminRole) })}>Apply</Button>
            {grant.data ? <p className="text-xs text-success">Updated. The user must sign in again to get the new role.</p> : null}
          </div>
        </Card>
      </div>
    </>
  );
}
