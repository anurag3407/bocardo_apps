'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { can, type AdminRole } from '@/core/auth/claims';
import { supabase } from '@/core/auth/supabase-browser';
import { useAdmin } from '@/core/auth/use-admin';

const NAV: { href: string; label: string; roles: AdminRole[] }[] = [
  { href: '/', label: 'Overview', roles: ['ops', 'support', 'finance'] },
  { href: '/live', label: 'Live ops', roles: ['ops', 'support'] },
  { href: '/orders', label: 'Orders', roles: ['ops', 'support', 'finance'] },
  { href: '/restaurants', label: 'Restaurants', roles: ['ops', 'support', 'finance'] },
  { href: '/riders', label: 'Riders', roles: ['ops', 'support', 'finance'] },
  { href: '/users', label: 'Customers', roles: ['ops', 'support'] },
  { href: '/zones', label: 'Zones & pricing', roles: ['ops'] },
  { href: '/coupons', label: 'Coupons', roles: ['finance', 'ops'] },
  { href: '/payouts', label: 'Payouts', roles: ['finance'] },
  { href: '/tickets', label: 'Support tickets', roles: ['support', 'ops'] },
  { href: '/audit', label: 'Audit log', roles: ['finance'] },
  { href: '/settings', label: 'Settings', roles: [] },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { claims, role } = useAdmin();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <aside className="flex w-full shrink-0 flex-col gap-1 border-b border-border bg-surface p-3 md:min-h-screen md:w-56 md:border-b-0 md:border-r">
      <div className="mb-3 px-2">
        <div className="text-lg font-black text-brand">bocardo</div>
        <div className="text-xs text-muted">Console · {role?.replace('_', ' ') ?? '…'}</div>
      </div>
      <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
        {NAV.filter((n) => can(role, ...n.roles)).map((n) => {
          const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={clsx('rounded-lg px-2 py-1.5 text-sm', active ? 'bg-brand-soft font-semibold text-brand' : 'text-text hover:bg-bg')}>
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto hidden px-2 pt-4 text-xs text-muted md:block">
        <div className="truncate">{claims?.email}</div>
        <button onClick={signOut} className="mt-1 text-brand">Sign out</button>
      </div>
    </aside>
  );
}
