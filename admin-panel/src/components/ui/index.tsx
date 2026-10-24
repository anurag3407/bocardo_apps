'use client';

import clsx from 'clsx';
import { Inbox, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({ variant = 'primary', loading, className, children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        {
          primary: 'bg-brand text-white shadow-sm hover:brightness-95',
          secondary: 'bg-brand-soft text-brand-text hover:brightness-95',
          ghost: 'border border-border bg-surface text-text hover:bg-surface-2',
          danger: 'bg-danger text-white shadow-sm hover:brightness-95',
        }[variant],
        className,
      )}>
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Card({ title, actions, className, children }: { title?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={clsx('rounded-2xl border border-border bg-surface p-5 shadow-card', className)}>
      {title || actions ? (
        <header className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
          <div className="flex gap-2">{actions}</div>
        </header>
      ) : null}
      {children}
    </section>
  );
}

const tones = {
  neutral: 'bg-surface-2 text-muted ring-border',
  brand: 'bg-brand-soft text-brand-text ring-brand/20',
  success: 'bg-success-soft text-success ring-success/20',
  warning: 'bg-warning-soft text-warning ring-warning/20',
  danger: 'bg-danger-soft text-danger ring-danger/20',
};

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset', tones[tone])}>
      <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden />
      {children}
    </span>
  );
}

const field = 'h-9 rounded-lg border border-border bg-surface px-3 text-sm text-text outline-none transition placeholder:text-subtle hover:border-subtle focus:border-brand focus:ring-4 focus:ring-brand/15';

export function Input({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
      {label}
      <input {...rest} className={clsx(field, className)} />
    </label>
  );
}

export function Textarea({ label, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
      {label}
      <textarea {...rest} className={clsx(field, 'h-auto py-2 font-mono', className)} />
    </label>
  );
}

export function Select({ label, options, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; options: { value: string; label: string }[] }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
      {label}
      <select {...rest} className={clsx(field, 'cursor-pointer pr-8', className)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

/** Minimal data table: typed columns, row click, empty/loading states, "load more" paging. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  loading,
  empty = 'Nothing here yet',
  onLoadMore,
}: {
  rows: T[] | undefined;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: string;
  onLoadMore?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
            <tr>{columns.map((c) => <th key={c.header} className={clsx('px-4 py-2.5 font-semibold', c.className)}>{c.header}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {columns.map((c) => (
                    <td key={c.header} className="px-4 py-3.5"><div className="h-3.5 w-3/4 animate-pulse rounded bg-surface-2" /></td>
                  ))}
                </tr>
              ))
            ) : !rows?.length ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14">
                  <div className="flex flex-col items-center gap-2 text-muted">
                    <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand-text"><Inbox className="size-5" aria-hidden /></span>
                    <span className="text-sm">{empty}</span>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={clsx('border-b border-border transition-colors last:border-0', onRowClick && 'cursor-pointer hover:bg-brand-soft/60')}>
                  {columns.map((c) => <td key={c.header} className={clsx('px-4 py-3 align-top', c.className)}>{c.cell(row)}</td>)}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {onLoadMore ? (
        <div className="border-t border-border bg-surface-2 p-2 text-center">
          <Button variant="ghost" onClick={onLoadMore}>Load more</Button>
        </div>
      ) : null}
    </div>
  );
}

export function Stat({ label, value, hint, tone, icon }: { label: string; value: ReactNode; hint?: string; tone?: 'danger' | 'success'; icon?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-muted">{label}</div>
        {icon ? (
          <span className={clsx('grid size-8 place-items-center rounded-lg [&>svg]:size-4', tone === 'danger' ? 'bg-danger-soft text-danger' : tone === 'success' ? 'bg-success-soft text-success' : 'bg-brand-soft text-brand-text')}>
            {icon}
          </span>
        ) : null}
      </div>
      <div className={clsx('text-[26px] font-extrabold leading-tight tracking-tight tabular-nums', tone === 'danger' && 'text-danger', tone === 'success' && 'text-success')}>{value}</div>
      {hint ? <div className="text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      <div className="flex flex-wrap items-end gap-2">{actions}</div>
    </div>
  );
}

export function Tabs<K extends string>({ value, onChange, tabs }: { value: K; onChange: (k: K) => void; tabs: { key: K; label: string }[] }) {
  return (
    <div className="mb-4 inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-surface p-1 shadow-card" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={clsx('rounded-lg px-3 py-1.5 text-sm font-semibold transition', value === t.key ? 'bg-ink text-white dark:bg-brand' : 'text-muted hover:bg-surface-2 hover:text-text')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Something went wrong';
  return (
    <p className="mb-4 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
      <TriangleAlert className="size-4 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

/** The Bocardo disc mark + lowercase wordmark. */
export function Logo({ size = 32, wordmark = true, className }: { size?: number; wordmark?: boolean; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG brand mark */}
      <img src="/logo.svg" alt="Bocardo" width={size} height={size} />
      {wordmark ? <span className="font-black tracking-tight" style={{ fontSize: size * 0.62 }}>bocardo</span> : null}
    </span>
  );
}
