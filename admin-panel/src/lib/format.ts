export const formatPaise = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const formatDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';
export const humanize = (s: string) => s.replace(/_/g, ' ').toLowerCase();
export const statusTone = (status: string): 'success' | 'danger' | 'warning' | 'brand' | 'neutral' =>
  ['DELIVERED', 'approved', 'active', 'paid', 'resolved', 'processed'].includes(status)
    ? 'success'
    : ['CANCELLED', 'REJECTED', 'PAYMENT_FAILED', 'UNDELIVERED', 'FAILED', 'rejected', 'suspended', 'failed'].includes(status)
      ? 'danger'
      : ['pending', 'open', 'PAYMENT_PENDING', 'PLACED'].includes(status)
        ? 'warning'
        : 'brand';
