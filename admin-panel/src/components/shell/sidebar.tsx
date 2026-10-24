'use client';

import clsx from 'clsx';
import {
  Bike,
  ChartPie,
  LifeBuoy,
  LogOut,
  MapPinned,
  Radar,
  ShieldCheck,
  ScrollText,
  Settings,
  ShoppingBag,
  Store,
  TicketPercent,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Logo } from '@/components/ui';
import { can, type AdminRole } from '@/core/auth/claims';
import { supabase } from '@/core/auth/supabase-browser';
import { useAdmin } from '@/core/auth/use-admin';

const NAV: { group: string; items: { href: string; label: string; icon: LucideIcon; roles: AdminRole[] }[] }[] = [
  {
    group: 'Operations',
    items: [
      { href: '/', label: 'Overview', icon: ChartPie, roles: ['ops', 'support', 'finance'] },
      { href: '/live', label: 'Live ops', icon: Radar, roles: ['ops', 'support'] },
      { href: '/orders', label: 'Orders', icon: ShoppingBag, roles: ['ops', 'support', 'finance'] },
    ],
  },
  {
    group: 'Network',
    items: [
      { href: '/restaurants', label: 'Restaurants', icon: Store, roles: ['ops', 'support', 'finance'] },
      { href: '/riders', label: 'Riders', icon: Bike, roles: ['ops', 'support', 'finance'] },
      { href: '/users', label: 'Customers', icon: Users, roles: ['ops', 'support'] },
      { href: '/zones', label: 'Zones & pricing', icon: MapPinned, roles: ['ops'] },
    ],
  },
  {
    group: 'Money',
    items: [
      { href: '/coupons', label: 'Coupons', icon: TicketPercent, roles: ['finance', 'ops'] },
      { href: '/payouts', label: 'Payouts', icon: Wallet, roles: ['finance'] },
    ],
  },
  {
    group: 'Support & admin',
    items: [
      { href: '/tickets', label: 'Support tickets', icon: LifeBuoy, roles: ['support', 'ops'] },
      { href: '/audit', label: 'Audit log', icon: ScrollText, roles: ['finance'] },
      { href: '/settings', label: 'Settings', icon: Settings, roles: [] },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { claims, role } = useAdmin();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((n) => can(role, ...n.roles)) })).filter((g) => g.items.length);

  return (
    <aside className="sticky top-0 z-10 flex w-full shrink-0 flex-col bg-sidebar text-sidebar-text md:h-screen md:w-64">
      <div className="flex items-center justify-between gap-3 px-5 py-4 md:py-6">
        <div className="text-white">
          <Logo size={34} />
          <div className="mt-1 pl-[42px] text-[11px] font-semibold uppercase tracking-widest text-sky">Console</div>
        </div>
        <button onClick={signOut} className="rounded-lg p-2 text-sidebar-text hover:bg-white/10 md:hidden" aria-label="Sign out">
          <LogOut className="size-4" />
        </button>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:gap-5 md:overflow-y-auto md:pb-0">
        {groups.map((g) => (
          <div key={g.group} className="flex gap-1 md:flex-col">
            <div className="hidden px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-white/35 md:block">{g.group}</div>
            {g.items.map((n) => {
              const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'group flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                    active ? 'bg-sky text-ink shadow-sm' : 'hover:bg-white/8 hover:text-white',
                  )}>
                  <Icon className={clsx('size-[18px]', active ? 'text-ink' : 'text-white/55 group-hover:text-white')} strokeWidth={2.2} aria-hidden />
                  {n.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="m-3 hidden items-center gap-3 rounded-xl bg-white/6 p-3 md:flex">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-lime text-sm font-black uppercase text-ink">{claims?.email?.[0] ?? 'B'}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-white">{claims?.email}</div>
          <div className="flex items-center gap-1 text-[11px] capitalize text-white/50">
            <ShieldCheck className="size-3" aria-hidden />
            {role?.replace('_', ' ') ?? '…'}
          </div>
        </div>
        <button onClick={signOut} className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out">
          <LogOut className="size-4" />
        </button>
      </div>
    </aside>
  );
}
