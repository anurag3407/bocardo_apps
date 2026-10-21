'use client';

import clsx from 'clsx';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({ variant = 'primary', loading, className, children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        {
          primary: 'bg-brand text-white hover:opacity-90',
          secondary: 'bg-brand-soft text-brand hover:opacity-90',
          ghost: 'border border-border text-text hover:bg-bg',
          danger: 'bg-danger text-white hover:opacity-90',
        }[variant],
        className,
      )}>
      {loading ? '…' : children}
    </button>
  );
}

export function Card({ title, actions, className, children }: { title?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={clsx('rounded-xl border border-border bg-surface p-4', className)}>
      {title || actions ? (
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          <div className="flex gap-2">{actions}</div>
        </header>
      ) : null}
      {children}
    </section>
  );
}

const tones = {
  neutral: 'border-border text-muted',
  brand: 'border-brand text-brand',
  success: 'border-success text-success',
  warning: 'border-warning text-warning',
  danger: 'border-danger text-danger',
};

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={clsx('inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}

export function Input({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input {...rest} className={clsx('rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-brand', className)} />
    </label>
  );
}

export function Textarea({ label, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <textarea {...rest} className={clsx('rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-text outline-none focus:border-brand', className)} />
    </label>
  );
}

export function Select({ label, options, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; options: { value: string; label: string }[] }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <select {...rest} className={clsx('rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text', className)}>
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
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted">
          <tr>{columns.map((c) => <th key={c.header} className={clsx('px-3 py-2 font-medium', c.className)}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-muted">Loading…</td></tr>
          ) : !rows?.length ? (
            <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-muted">{empty}</td></tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} className={clsx('border-b border-border last:border-0', onRowClick && 'cursor-pointer hover:bg-bg')}>
                {columns.map((c) => <td key={c.header} className={clsx('px-3 py-2 align-top', c.className)}>{c.cell(row)}</td>)}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {onLoadMore ? (
        <div className="border-t border-border p-2 text-center">
          <Button variant="ghost" onClick={onLoadMore}>Load more</Button>
        </div>
      ) : null}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'danger' | 'success' }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs uppercase text-muted">{label}</div>
      <div className={clsx('mt-1 text-2xl font-bold tabular-nums', tone === 'danger' && 'text-danger', tone === 'success' && 'text-success')}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

export function Tabs<K extends string>({ value, onChange, tabs }: { value: K; onChange: (k: K) => void; tabs: { key: K; label: string }[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-1">
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)} className={clsx('rounded-full border px-3 py-1 text-sm', value === t.key ? 'border-brand bg-brand-soft text-brand' : 'border-border text-muted')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Something went wrong';
  return <p className="rounded-lg border border-danger bg-brand-soft px-3 py-2 text-sm text-danger">{message}</p>;
}
