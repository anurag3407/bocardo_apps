'use client';

import { useState } from 'react';
import { ExternalLink, FileCheck, AlertCircle, CheckCircle2, Building2, CreditCard, ShieldCheck, X, MapPin, Phone, Mail, User } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { useAdminAccountsRestaurantDocuments } from '@/core/api/generated/admin/admin';
import type { AdminRestaurant } from '@/core/api/generated/model';
import { statusTone } from '@/lib/format';

const PRESET_REJECTION_REASONS = [
  'FSSAI certificate image is blurry or unreadable. Please upload a clear photo or PDF scan.',
  'FSSAI licence has expired. Please provide a valid, renewed FSSAI certificate.',
  'Restaurant address does not match the premises address on the FSSAI licence.',
  'PAN card details or legal entity name do not match application details.',
  'Invalid bank IFSC code or account holder name mismatch on cheque.',
  'Outlet location coordinates are outside Bocardo delivery zone.',
];

export interface RestaurantReviewModalProps {
  restaurant: AdminRestaurant | null;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  onSuspend: (id: string, reason: string) => void;
  onEditTerms: (r: AdminRestaurant) => void;
  loading?: boolean;
}

export function RestaurantReviewModal({
  restaurant,
  onClose,
  onApprove,
  onReject,
  onSuspend,
  onEditTerms,
  loading,
}: RestaurantReviewModalProps) {
  const [rejecting, setRejecting] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [customReason, setCustomReason] = useState('');

  const docsQuery = useAdminAccountsRestaurantDocuments(restaurant?.id ?? '', {
    query: { enabled: !!restaurant?.id },
  });

  if (!restaurant) return null;
  const docs = docsQuery.data;

  const handleReject = () => {
    if (!customReason.trim()) return;
    onReject(restaurant.id, customReason.trim());
    setRejecting(false);
  };

  const handleSuspend = () => {
    if (!customReason.trim()) return;
    onSuspend(restaurant.id, customReason.trim());
    setSuspending(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <header className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface-2/40">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-brand/10 text-brand font-bold text-lg">
              {restaurant.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-text">{restaurant.name}</h2>
                <Badge tone={statusTone(restaurant.status)}>{restaurant.status}</Badge>
                {restaurant.status === 'active' ? (
                  <span className="text-xs text-muted">
                    {restaurant.isOpen ? '• accepting orders' : '• closed'}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted">{restaurant.cuisines.join(', ')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text transition"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </header>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Previous Rejection or Suspension Banner */}
          {restaurant.rejectionReason ? (
            <div className="rounded-xl border border-danger/30 bg-danger-soft/60 p-4 flex gap-3 text-sm">
              <AlertCircle className="size-5 text-danger shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-danger">Recorded Ops Feedback / Reason:</p>
                <p className="text-text mt-0.5">{restaurant.rejectionReason}</p>
              </div>
            </div>
          ) : null}

          {/* Section 1: Contact & Location */}
          <div className="rounded-xl border border-border p-4 bg-surface space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Building2 className="size-4 text-brand" /> Restaurant & Outlet Location
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-muted block">Applicant / Owner:</span>
                <span className="font-medium flex items-center gap-1.5 mt-0.5">
                  <User className="size-3.5 text-muted" /> {restaurant.ownerName ?? '—'}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted block">Contact Phone:</span>
                <span className="font-medium flex items-center gap-1.5 mt-0.5">
                  <Phone className="size-3.5 text-muted" /> {restaurant.phone ?? '—'}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted block">Contact Email:</span>
                <span className="font-medium flex items-center gap-1.5 mt-0.5">
                  <Mail className="size-3.5 text-muted" /> {restaurant.email ?? restaurant.ownerEmail ?? '—'}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted block">Terms:</span>
                <span className="font-medium">
                  {restaurant.commissionBps / 100}% commission · {restaurant.deliveryRadiusM / 1000} km radius
                </span>
              </div>
              <div className="md:col-span-2">
                <span className="text-xs text-muted block">Full Address:</span>
                <p className="mt-0.5 text-text flex items-start gap-1.5">
                  <MapPin className="size-4 text-muted shrink-0 mt-0.5" />
                  <span>{restaurant.addressLine}</span>
                </p>
                <a
                  href={`https://www.google.com/maps?q=${restaurant.lat},${restaurant.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-brand hover:underline mt-1 ml-5 font-medium"
                >
                  View GPS Coordinates on Map ({restaurant.lat.toFixed(4)}, {restaurant.lng.toFixed(4)}){' '}
                  <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Section 2: Food Safety & Regulatory Compliance (FSSAI / PAN / GST) */}
          <div className="rounded-xl border border-border p-4 bg-surface space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-success" /> Food Safety & Tax Compliance (Swiggy / Zomato Standards)
            </h3>

            {/* FSSAI */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-lg bg-surface-2/60 border border-border">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">FSSAI Licence:</span>
                  <span className="font-mono text-sm bg-surface px-2 py-0.5 rounded border border-border">
                    {restaurant.fssaiLicense ?? 'NOT PROVIDED'}
                  </span>
                  {restaurant.fssaiLicense && /^\d{14}$/.test(restaurant.fssaiLicense) ? (
                    <Badge tone="success">14-Digit Valid</Badge>
                  ) : (
                    <Badge tone="danger">Invalid / Missing</Badge>
                  )}
                </div>
                <p className="text-xs text-muted mt-1">
                  Expiry Date:{' '}
                  <span className="font-medium text-text">
                    {restaurant.fssaiExpiryDate ?? 'Not specified'}
                  </span>
                </p>
              </div>
              <div>
                {docs?.fssaiUrl ? (
                  <a
                    href={docs.fssaiUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand hover:brightness-95 transition"
                  >
                    <FileCheck className="size-4" /> View FSSAI Certificate <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <span className="text-xs text-muted italic">No certificate uploaded</span>
                )}
              </div>
            </div>

            {/* PAN & Legal Entity */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-lg bg-surface-2/60 border border-border">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">Business PAN:</span>
                  <span className="font-mono text-sm bg-surface px-2 py-0.5 rounded border border-border">
                    {restaurant.panNumber ?? '—'}
                  </span>
                </div>
                <p className="text-xs text-muted mt-1">
                  Legal Registered Entity:{' '}
                  <span className="font-medium text-text">
                    {restaurant.legalEntityName ?? '—'}
                  </span>
                </p>
              </div>
              <div>
                {docs?.panUrl ? (
                  <a
                    href={docs.panUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-2 transition"
                  >
                    <FileCheck className="size-4 text-muted" /> View PAN Card <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <span className="text-xs text-muted italic">No PAN card uploaded</span>
                )}
              </div>
            </div>

            {/* GSTIN */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-lg bg-surface-2/60 border border-border">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">GSTIN:</span>
                  <span className="font-mono text-sm bg-surface px-2 py-0.5 rounded border border-border">
                    {restaurant.gstin || 'Exempted (Under ₹20L/₹40L threshold)'}
                  </span>
                </div>
              </div>
              <div>
                {docs?.gstUrl ? (
                  <a
                    href={docs.gstUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-2 transition"
                  >
                    <FileCheck className="size-4 text-muted" /> View GST Document <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          {/* Section 3: Banking & Payouts */}
          <div className="rounded-xl border border-border p-4 bg-surface space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <CreditCard className="size-4 text-brand" /> Settlement & Bank Account Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-muted block">Beneficiary Name:</span>
                <span className="font-medium text-text">{restaurant.bankBeneficiaryName ?? '—'}</span>
              </div>
              <div>
                <span className="text-xs text-muted block">Bank Name:</span>
                <span className="font-medium text-text">{restaurant.bankName ?? '—'}</span>
              </div>
              <div>
                <span className="text-xs text-muted block">Account Number:</span>
                <span className="font-mono font-medium text-text">
                  {restaurant.bankAccountNumber ?? '—'}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted block">IFSC Code:</span>
                <span className="font-mono font-medium text-text">{restaurant.bankIfsc ?? '—'}</span>
              </div>
              <div className="md:col-span-2 pt-2 border-t border-border">
                {docs?.chequeUrl ? (
                  <a
                    href={docs.chequeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-2 transition"
                  >
                    <FileCheck className="size-4 text-muted" /> View Cancelled Cheque / Passbook{' '}
                    <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <span className="text-xs text-muted italic">No cheque proof attached</span>
                )}
              </div>
            </div>
          </div>

          {/* Rejection / Correction Form Mode */}
          {rejecting ? (
            <div className="rounded-xl border border-danger/40 bg-danger-soft/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-danger flex items-center gap-1.5">
                  <AlertCircle className="size-4" /> Reject / Request Corrections from Merchant
                </h4>
                <button
                  onClick={() => setRejecting(false)}
                  className="text-xs text-muted hover:text-text"
                >
                  Cancel
                </button>
              </div>

              <p className="text-xs text-muted">
                Select a preset reason or enter specific feedback. The merchant will see this in their
                app and can edit their details:
              </p>

              <div className="flex flex-wrap gap-1.5">
                {PRESET_REJECTION_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setCustomReason(reason)}
                    className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-text hover:bg-surface-2 transition text-left"
                  >
                    {reason.slice(0, 50)}...
                  </button>
                ))}
              </div>

              <textarea
                rows={3}
                placeholder="Specific reason for rejection or needed document fix..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface p-2.5 text-sm text-text outline-none focus:border-danger"
              />

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  disabled={!customReason.trim()}
                  loading={loading}
                  onClick={handleReject}
                >
                  Send Rejection & Notify Merchant
                </Button>
              </div>
            </div>
          ) : null}

          {/* Suspension Form Mode */}
          {suspending ? (
            <div className="rounded-xl border border-warning/40 bg-warning-soft/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-warning flex items-center gap-1.5">
                  <AlertCircle className="size-4" /> Suspend Restaurant Outlet
                </h4>
                <button
                  onClick={() => setSuspending(false)}
                  className="text-xs text-muted hover:text-text"
                >
                  Cancel
                </button>
              </div>

              <textarea
                rows={2}
                placeholder="Reason for suspending outlet (e.g. food safety violation, expired FSSAI)..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface p-2.5 text-sm text-text outline-none focus:border-warning"
              />

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setSuspending(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  disabled={!customReason.trim()}
                  loading={loading}
                  onClick={handleSuspend}
                >
                  Confirm Suspension
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Modal Footer Actions */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4 bg-surface-2/40">
          <Button variant="ghost" onClick={() => onEditTerms(restaurant)}>
            Edit Commercial Terms
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            {restaurant.status !== 'active' ? (
              <Button
                variant="primary"
                loading={loading}
                onClick={() => onApprove(restaurant.id)}
                className="gap-1.5"
              >
                <CheckCircle2 className="size-4" /> Approve & Activate
              </Button>
            ) : null}

            {restaurant.status === 'pending' && !rejecting ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setCustomReason('');
                  setRejecting(true);
                  setSuspending(false);
                }}
              >
                Reject / Request Fix
              </Button>
            ) : null}

            {restaurant.status === 'active' && !suspending ? (
              <Button
                variant="danger"
                onClick={() => {
                  setCustomReason('');
                  setSuspending(true);
                  setRejecting(false);
                }}
              >
                Suspend Outlet
              </Button>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  );
}
