'use client';

import { useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileCheck,
  MapPin,
  Phone,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { useAdminAccountsRiderDocuments } from '@/core/api/generated/admin/admin';
import type { AdminRider } from '@/core/api/generated/model';
import { statusTone } from '@/lib/format';

const PRESET_REJECTION_REASONS = [
  'Aadhaar card photo is blurry, cropped, or unreadable. Please upload a clear photo of the original card.',
  'Driving licence has expired or vehicle class does not cover two-wheelers.',
  'Vehicle RC registration number does not match application details or RC photo is unclear.',
  'PAN card details or name do not match applicant identity.',
  'Bank account holder name does not match applicant KYC name or IFSC code is invalid.',
  'Applicant does not meet the minimum age requirement of 18 years.',
];

const PRESET_SUSPENSION_REASONS = [
  'Repeated unfulfilled deliveries or unaccounted transit delays.',
  'Multiple customer complaints of vehicle mismatch or unauthorized third-party driving.',
  'Failure to deposit collected cash within assigned credit threshold.',
  'Fraudulent GPS spoofing or location tampering detected.',
];

export interface RiderReviewModalProps {
  rider: AdminRider | null;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  onSuspend: (id: string, reason: string) => void;
  loading?: boolean;
}

export function RiderReviewModal({
  rider,
  onClose,
  onApprove,
  onReject,
  onSuspend,
  loading,
}: RiderReviewModalProps) {
  const [rejecting, setRejecting] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [customReason, setCustomReason] = useState('');

  const docsQuery = useAdminAccountsRiderDocuments(rider?.id ?? '', {
    query: { enabled: !!rider?.id },
  });

  if (!rider) return null;
  const docs = docsQuery.data;

  const handleReject = () => {
    if (!customReason.trim()) return;
    onReject(rider.id, customReason.trim());
    setRejecting(false);
  };

  const handleSuspend = () => {
    if (!customReason.trim()) return;
    onSuspend(rider.id, customReason.trim());
    setSuspending(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <header className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface-2/40">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-brand/10 text-brand font-bold text-lg">
              {rider.name ? rider.name.charAt(0) : 'R'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-text">
                  {rider.name ?? 'Rider Profile'}
                </h2>
                <Badge tone={statusTone(rider.kycStatus)}>{rider.kycStatus}</Badge>
                {rider.isOnline ? (
                  <span className="text-xs text-success font-medium">
                    • Online{rider.currentOrderId ? ' (Busy)' : ''}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted flex items-center gap-2 mt-0.5">
                <span>{rider.phone}</span>
                <span>•</span>
                <span className="capitalize">{rider.vehicleType}</span>
                {rider.vehicleNumber ? <span>• {rider.vehicleNumber}</span> : null}
              </p>
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
          {rider.rejectionReason ? (
            <div className="rounded-xl border border-danger/30 bg-danger-soft/60 p-4 flex gap-3 text-sm">
              <AlertCircle className="size-5 text-danger shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-danger">Recorded Ops Feedback / Reason:</p>
                <p className="text-text mt-0.5">{rider.rejectionReason}</p>
                {rider.verifiedBy ? (
                  <p className="text-xs text-muted mt-1">
                    Logged by Admin ID: {rider.verifiedBy}{' '}
                    {rider.verifiedAt ? `on ${new Date(rider.verifiedAt).toLocaleDateString()}` : ''}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Section 1: Personal & Emergency Contact */}
          <div className="rounded-xl border border-border bg-surface-2/20 p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-text border-b border-border/60 pb-2">
              <User className="size-4 text-brand" />
              <span>Personal & Emergency Details</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-muted block">Legal Full Name</span>
                <span className="font-semibold text-text">{rider.name ?? '—'}</span>
              </div>
              <div>
                <span className="text-xs text-muted block">Mobile Number</span>
                <span className="font-medium text-text">{rider.phone ?? '—'}</span>
              </div>
              <div>
                <span className="text-xs text-muted block">Date of Birth & Gender</span>
                <span className="font-medium text-text">
                  {rider.dob ?? '—'} {rider.gender ? `(${rider.gender.toUpperCase()})` : ''}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted block">Current Address</span>
                <span className="font-medium text-text">{rider.currentAddress ?? '—'}</span>
              </div>
              <div>
                <span className="text-xs text-muted block">Emergency Contact</span>
                <span className="font-semibold text-text">
                  {rider.emergencyContactName ?? '—'}{' '}
                  {rider.emergencyContactRelation ? `(${rider.emergencyContactRelation})` : ''}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted block">Emergency Phone</span>
                <span className="font-medium text-text">{rider.emergencyContactPhone ?? '—'}</span>
              </div>
            </div>
          </div>

          {/* Section 2: Vehicle & Driving Licence */}
          <div className="rounded-xl border border-border bg-surface-2/20 p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-text border-b border-border/60 pb-2">
              <Building2 className="size-4 text-brand" />
              <span>Vehicle & Driving Licence</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-muted block">Vehicle Type</span>
                <span className="font-semibold text-text capitalize">{rider.vehicleType}</span>
              </div>
              <div>
                <span className="text-xs text-muted block">Registration Number (RC)</span>
                <span className="font-mono font-medium text-text">{rider.vehicleNumber ?? '—'}</span>
                {docs?.rcDocumentUrl ? (
                  <a
                    href={docs.rcDocumentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-brand hover:underline mt-1 font-medium"
                  >
                    View RC Document <ExternalLink className="size-3" />
                  </a>
                ) : rider.rcDocumentPath ? (
                  <span className="text-xs text-muted block mt-1">Doc path: {rider.rcDocumentPath}</span>
                ) : null}
              </div>

              {rider.vehicleType !== 'bicycle' ? (
                <>
                  <div>
                    <span className="text-xs text-muted block">Driving Licence Number</span>
                    <span className="font-mono font-semibold text-text">
                      {rider.licenseNumber ?? '—'}
                    </span>
                    <div className="flex flex-wrap gap-3 mt-1">
                      {docs?.licenseFrontUrl ? (
                        <a
                          href={docs.licenseFrontUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-brand hover:underline font-medium"
                        >
                          Licence Front <ExternalLink className="size-3" />
                        </a>
                      ) : null}
                      {docs?.licenseBackUrl ? (
                        <a
                          href={docs.licenseBackUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-brand hover:underline font-medium"
                        >
                          Licence Back <ExternalLink className="size-3" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-muted block">Licence Expiry Date</span>
                    <span className="font-medium text-text">{rider.licenseExpiryDate ?? '—'}</span>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {/* Section 3: Government KYC (Aadhaar & PAN) */}
          <div className="rounded-xl border border-border bg-surface-2/20 p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-text border-b border-border/60 pb-2">
              <ShieldCheck className="size-4 text-brand" />
              <span>Government Identity Verification (Aadhaar & PAN)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-muted block">Aadhaar Number</span>
                <span className="font-mono font-semibold text-text">
                  {rider.aadhaarNumber ?? '—'}
                </span>
                <div className="flex flex-wrap gap-3 mt-1">
                  {docs?.aadhaarFrontUrl ? (
                    <a
                      href={docs.aadhaarFrontUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-brand hover:underline font-medium"
                    >
                      Aadhaar Front <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                  {docs?.aadhaarBackUrl ? (
                    <a
                      href={docs.aadhaarBackUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-brand hover:underline font-medium"
                    >
                      Aadhaar Back <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>
              </div>

              <div>
                <span className="text-xs text-muted block">PAN Number</span>
                <span className="font-mono font-semibold text-text">{rider.panNumber ?? '—'}</span>
                {docs?.panCardUrl ? (
                  <a
                    href={docs.panCardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-brand hover:underline mt-1 font-medium block"
                  >
                    View PAN Card <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          {/* Section 4: Bank Account for Weekly Payouts */}
          <div className="rounded-xl border border-border bg-surface-2/20 p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-text border-b border-border/60 pb-2">
              <CreditCard className="size-4 text-brand" />
              <span>Weekly Payout Bank Account</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-muted block">Account Beneficiary</span>
                <span className="font-semibold text-text">
                  {rider.bankBeneficiaryName ?? '—'}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted block">Bank Name</span>
                <span className="font-medium text-text">{rider.bankName ?? '—'}</span>
              </div>
              <div>
                <span className="text-xs text-muted block">Account Number</span>
                <span className="font-mono font-medium text-text">
                  {rider.bankAccountNumber ?? '—'}
                </span>
                {docs?.chequeUrl ? (
                  <a
                    href={docs.chequeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-brand hover:underline mt-1 font-medium block"
                  >
                    View Cheque / Passbook <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </div>
              <div>
                <span className="text-xs text-muted block">IFSC Code</span>
                <span className="font-mono font-semibold text-text">{rider.bankIfsc ?? '—'}</span>
              </div>
            </div>
          </div>

          {/* Reject Reason Selection Panel */}
          {rejecting ? (
            <div className="rounded-xl border border-danger/40 bg-danger-soft/40 p-4 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-danger">Select Rejection Reason</span>
                <button
                  onClick={() => setRejecting(false)}
                  className="text-xs text-muted hover:text-text"
                >
                  Cancel
                </button>
              </div>
              <div className="space-y-1.5">
                {PRESET_REJECTION_REASONS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCustomReason(preset)}
                    className="w-full text-left rounded-lg border border-border bg-surface px-3 py-2 text-xs hover:border-danger/60 transition"
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Or type custom instructions for the rider..."
                className="w-full rounded-lg border border-border bg-surface p-2 text-xs focus:outline-none focus:ring-1 focus:ring-danger"
                rows={3}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handleReject}
                  disabled={!customReason.trim()}
                  loading={loading}
                >
                  Send Rejection Feedback
                </Button>
              </div>
            </div>
          ) : null}

          {/* Suspend Reason Selection Panel */}
          {suspending ? (
            <div className="rounded-xl border border-danger/40 bg-danger-soft/40 p-4 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-danger">Select Suspension Reason</span>
                <button
                  onClick={() => setSuspending(false)}
                  className="text-xs text-muted hover:text-text"
                >
                  Cancel
                </button>
              </div>
              <div className="space-y-1.5">
                {PRESET_SUSPENSION_REASONS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCustomReason(preset)}
                    className="w-full text-left rounded-lg border border-border bg-surface px-3 py-2 text-xs hover:border-danger/60 transition"
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Or specify the incident report details..."
                className="w-full rounded-lg border border-border bg-surface p-2 text-xs focus:outline-none focus:ring-1 focus:ring-danger"
                rows={3}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setSuspending(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handleSuspend}
                  disabled={!customReason.trim()}
                  loading={loading}
                >
                  Suspend Account
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Modal Footer Actions */}
        <footer className="flex items-center justify-between border-t border-border px-6 py-4 bg-surface-2/40">
          <div className="text-xs text-muted">
            Created: {new Date(rider.createdAt).toLocaleDateString()}
          </div>
          <div className="flex items-center gap-2">
            {!rejecting && !suspending ? (
              <>
                {rider.kycStatus === 'approved' ? (
                  <Button
                    variant="danger"
                    onClick={() => {
                      setCustomReason('');
                      setSuspending(true);
                    }}
                  >
                    Suspend Rider
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setCustomReason('');
                      setRejecting(true);
                    }}
                  >
                    Reject Application
                  </Button>
                )}

                {rider.kycStatus !== 'approved' ? (
                  <Button
                    onClick={() => onApprove(rider.id)}
                    loading={loading}
                    className="bg-brand text-white hover:bg-brand/90"
                  >
                    <CheckCircle2 className="size-4 mr-1.5" />
                    Approve KYC
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  );
}
