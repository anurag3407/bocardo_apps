'use client';

import { useState } from 'react';
import { Badge, Button, Card, DataTable, ErrorNote, Input, PageHeader, Select } from '@/components/ui';
import { adminPlatformCreateCoupon, adminPlatformUpdateCoupon, useAdminPlatformCoupons } from '@/core/api/generated/admin/admin';
import { useAction } from '@/features/common/use-action';
import { formatDateTime, formatPaise } from '@/lib/format';

export function CouponsView() {
  const coupons = useAdminPlatformCoupons();
  const create = useAction(adminPlatformCreateCoupon);
  const toggle = useAction((a: { id: string; isActive: boolean }) => adminPlatformUpdateCoupon(a.id, { isActive: a.isActive }));
  const [f, setF] = useState({ code: '', description: '', type: 'percent', value: '', maxDiscount: '', minOrder: '', maxUses: '', perUser: '1', firstOrder: 'no' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = () =>
    create.mutate(
      {
        code: f.code.toUpperCase(),
        description: f.description || null,
        discountType: f.type as 'percent' | 'flat',
        discountValue: f.type === 'percent' ? Number(f.value) : Math.round(Number(f.value) * 100),
        maxDiscountPaise: f.maxDiscount ? Math.round(Number(f.maxDiscount) * 100) : null,
        minOrderPaise: f.minOrder ? Math.round(Number(f.minOrder) * 100) : 0,
        maxUses: f.maxUses ? Number(f.maxUses) : null,
        perUserLimit: Number(f.perUser) || 1,
        firstOrderOnly: f.firstOrder === 'yes',
        isActive: true,
      },
      { onSuccess: () => setF({ ...f, code: '', description: '', value: '' }) },
    );

  return (
    <>
      <PageHeader title="Coupons" subtitle="Platform-funded unless tied to a restaurant" />
      <Card title="New coupon" className="mb-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Input label="Code" value={f.code} onChange={set('code')} />
          <Select label="Type" value={f.type} onChange={set('type')} options={[{ value: 'percent', label: '% off' }, { value: 'flat', label: '₹ off' }]} />
          <Input label={f.type === 'percent' ? 'Percent' : 'Amount ₹'} type="number" value={f.value} onChange={set('value')} />
          <Input label="Max discount ₹" type="number" value={f.maxDiscount} onChange={set('maxDiscount')} />
          <Input label="Min order ₹" type="number" value={f.minOrder} onChange={set('minOrder')} />
          <Input label="Total uses" type="number" value={f.maxUses} onChange={set('maxUses')} placeholder="unlimited" />
          <Input label="Uses per customer" type="number" value={f.perUser} onChange={set('perUser')} />
          <Select label="First order only" value={f.firstOrder} onChange={set('firstOrder')} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} />
          <Input label="Description" value={f.description} onChange={set('description')} />
          <div className="flex items-end"><Button className="w-full" loading={create.isPending} disabled={!f.code || !f.value} onClick={submit}>Create</Button></div>
        </div>
      </Card>
      <ErrorNote error={coupons.error} />
      <DataTable
        rows={coupons.data}
        loading={coupons.isLoading}
        rowKey={(c) => c.id}
        columns={[
          { header: 'Code', cell: (c) => <span className="font-mono font-semibold">{c.code}</span> },
          { header: 'Offer', cell: (c) => (c.discountType === 'percent' ? `${c.discountValue}% off${c.maxDiscountPaise ? ` up to ${formatPaise(c.maxDiscountPaise)}` : ''}` : `${formatPaise(c.discountValue)} off`) },
          { header: 'Min order', cell: (c) => formatPaise(c.minOrderPaise) },
          { header: 'Used', cell: (c) => `${c.usedCount}${c.maxUses ? ` / ${c.maxUses}` : ''}` },
          { header: 'Valid until', cell: (c) => formatDateTime(c.validUntil) },
          { header: 'Status', cell: (c) => <Badge tone={c.isActive ? 'success' : 'neutral'}>{c.isActive ? 'active' : 'off'}</Badge> },
          { header: '', cell: (c) => <Button variant="ghost" onClick={() => toggle.mutate({ id: c.id, isActive: !c.isActive })}>{c.isActive ? 'Disable' : 'Enable'}</Button> },
        ]}
      />
    </>
  );
}
