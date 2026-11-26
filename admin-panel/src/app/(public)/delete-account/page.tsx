'use client';

import { useState } from 'react';
import { env } from '@/core/config/env';

export default function DeleteAccountPage() {
  const [phone, setPhone] = useState('');
  const [appType, setAppType] = useState<'customer' | 'restaurant' | 'rider'>('customer');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${env.apiUrl}/public/deletion-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          app: appType,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
      }
      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message || 'Could not submit your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article className="prose prose-slate max-w-none bg-white p-6 sm:p-10 rounded-2xl shadow-sm border border-slate-200">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-2">Request Account &amp; Data Deletion</h1>
      <p className="text-sm text-slate-500 mb-8">Google Play &amp; Apple App Store Data Deletion Compliance</p>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">How Account Deletion Works</h2>
        <p className="text-slate-700 leading-relaxed">
          At Bocardo, you have full control over your personal data. You can delete your account directly inside the app, or you can submit a deletion request through this web page if you have already uninstalled the application.
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-8 not-prose">
        <div className="bg-sky-50 border border-sky-100 rounded-xl p-5">
          <h3 className="font-bold text-sky-900 text-lg mb-2">1. In-App Instant Deletion</h3>
          <p className="text-sm text-sky-800 leading-relaxed mb-3">
            The fastest way to delete your account is through the Bocardo mobile apps:
          </p>
          <ol className="list-decimal pl-5 text-sm text-sky-800 space-y-1">
            <li>Open the Bocardo app (Customer, Partner, or Rider).</li>
            <li>Go to the <strong>Account</strong> or <strong>Profile</strong> tab.</li>
            <li>Scroll down and tap <strong>Delete account</strong>.</li>
            <li>Confirm the prompt. Your personal profile and device tokens are deleted immediately.</li>
          </ol>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
          <h3 className="font-bold text-slate-900 text-lg mb-2">2. Web Deletion Request</h3>
          <p className="text-sm text-slate-700 leading-relaxed mb-3">
            If you no longer have the app installed, submit the form below. Our support team will verify your identity via SMS/email and execute your request within 7 business days.
          </p>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">What Data Is Deleted vs. Retained</h2>
        <div className="overflow-x-auto not-prose">
          <table className="w-full text-sm text-left border border-slate-200 rounded-lg overflow-hidden">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3">Data Category</th>
                <th className="p-3">Action Upon Deletion</th>
                <th className="p-3">Retention Basis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              <tr>
                <td className="p-3 font-medium">Personal Profile (Name, Phone, Email, Avatar)</td>
                <td className="p-3 text-emerald-700 font-medium">Permanently Deleted / Anonymised</td>
                <td className="p-3 text-slate-500">None. Immediately removed from active records.</td>
              </tr>
              <tr>
                <td className="p-3 font-medium">Delivery Addresses &amp; GPS coordinates</td>
                <td className="p-3 text-emerald-700 font-medium">Permanently Deleted</td>
                <td className="p-3 text-slate-500">None. Address records unlinked and deleted.</td>
              </tr>
              <tr>
                <td className="p-3 font-medium">Device Tokens (FCM Push notifications)</td>
                <td className="p-3 text-emerald-700 font-medium">Permanently Deleted</td>
                <td className="p-3 text-slate-500">Push notifications stopped immediately.</td>
              </tr>
              <tr>
                <td className="p-3 font-medium">KYC Documents (Rider / Partner licenses, certificates)</td>
                <td className="p-3 text-emerald-700 font-medium">Anonymised / Removed</td>
                <td className="p-3 text-slate-500">Sensitive IDs cleared from active operational databases.</td>
              </tr>
              <tr>
                <td className="p-3 font-medium">Past Order Tax Invoices &amp; Ledger Rows</td>
                <td className="p-3 text-amber-700 font-medium">Archived (Personal details unlinked)</td>
                <td className="p-3 text-slate-500">Retained strictly for statutory tax, financial audit, and legal accounting compliance.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8 not-prose">
        <h2 className="text-xl font-bold text-slate-800 mb-4">Submit Web Deletion Request</h2>
        {submitted ? (
          <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-xl text-emerald-900">
            <h3 className="font-bold text-lg mb-1">Request Received</h3>
            <p className="text-sm">
              We have received your account deletion request for <strong>{phone}</strong>. A confirmation SMS will be sent to verify your identity. Once confirmed, your personal data will be purged.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 max-w-lg bg-slate-50 p-6 rounded-xl border border-slate-200">
            <div>
              <label htmlFor="appType" className="block text-sm font-medium text-slate-700 mb-1">Select App</label>
              <select
                id="appType"
                value={appType}
                onChange={(e) => setAppType(e.target.value as 'customer' | 'restaurant' | 'rider')}
                className="w-full rounded-lg border-slate-300 border p-2 text-sm bg-white"
              >
                <option value="customer">Bocardo (Customer App)</option>
                <option value="restaurant">Bocardo Partner (Restaurant App)</option>
                <option value="rider">Bocardo Rider (Delivery App)</option>
              </select>
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">Registered Mobile Number (+91)</label>
              <input
                id="phone"
                type="tel"
                required
                placeholder="9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border-slate-300 border p-2 text-sm bg-white"
              />
            </div>

            <div>
              <label htmlFor="reason" className="block text-sm font-medium text-slate-700 mb-1">Reason for Deletion (Optional)</label>
              <textarea
                id="reason"
                rows={3}
                placeholder="Let us know why you are leaving..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border-slate-300 border p-2 text-sm bg-white"
              />
            </div>

            {error ? (
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors shadow-sm"
            >
              {submitting ? 'Submitting...' : 'Submit Deletion Request'}
            </button>
          </form>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Need Further Assistance?</h2>
        <p className="text-slate-700 text-sm">
          You can also email our privacy team directly at <a href="mailto:privacy@bocardo.app" className="text-sky-600 underline">privacy@bocardo.app</a> with the subject line <em>&quot;Account Deletion Request&quot;</em>.
        </p>
      </section>
    </article>
  );
}
