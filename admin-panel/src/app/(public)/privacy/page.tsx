import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy - Bocardo',
  description: 'Privacy Policy for Bocardo Customer, Bocardo Partner, and Bocardo Rider applications.',
};

export default function PrivacyPolicyPage() {
  return (
    <article className="prose prose-slate max-w-none bg-white p-6 sm:p-10 rounded-2xl shadow-sm border border-slate-200">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-2">Bocardo Privacy Policy</h1>
      <p className="text-sm text-slate-500 mb-8">Effective Date: November 9, 2026 · Last Updated: November 9, 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">1. Introduction</h2>
        <p className="text-slate-700 leading-relaxed">
          Welcome to Bocardo (&quot;Bocardo&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). This Privacy Policy explains how Bocardo Technologies collects, uses, shares, and protects personal data obtained from users of our mobile applications—including the <strong>Bocardo</strong> customer app, <strong>Bocardo Partner</strong> restaurant app, and <strong>Bocardo Rider</strong> delivery partner app—and our associated website and services (collectively, the &quot;Services&quot;).
        </p>
        <p className="text-slate-700 leading-relaxed mt-2">
          By downloading, accessing, or using any Bocardo application, you agree to the collection and use of information in accordance with this Privacy Policy.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">2. Information We Collect</h2>
        <p className="text-slate-700 leading-relaxed">
          We collect information you provide directly, data gathered automatically from your device, and information generated through your use of our Services:
        </p>

        <h3 className="text-lg font-semibold text-slate-800 mt-4 mb-2">A. Personal Identification &amp; Account Information</h3>
        <ul className="list-disc pl-6 space-y-1 text-slate-700">
          <li><strong>Mobile Phone Number:</strong> Required to authenticate accounts via SMS One-Time Passwords (OTP).</li>
          <li><strong>Name &amp; Profile Details:</strong> Full name, optional email address, and avatar image.</li>
          <li><strong>Delivery Addresses:</strong> Street address, landmark, recipient phone number, and delivery instructions.</li>
          <li><strong>Partner &amp; KYC Verification Details:</strong> For restaurant owners and delivery riders, regulatory documents including FSSAI licenses, GSTIN certificates, PAN cards, government photo identity (such as Aadhaar or Driving Licence), vehicle registration (RC), and bank account information for payouts.</li>
        </ul>

        <h3 className="text-lg font-semibold text-slate-800 mt-4 mb-2">B. Location Information</h3>
        <ul className="list-disc pl-6 space-y-1 text-slate-700">
          <li><strong>Foreground Location (Customers, Partners, Riders):</strong> We collect precise and coarse GPS coordinates while the app is in active use to locate restaurants nearby, set delivery drop-off points, and pin restaurant outlets.</li>
          <li><strong>Background Location (Bocardo Rider Delivery Partners Only):</strong> When delivery riders toggle &quot;On Duty&quot; or are assigned active deliveries, <strong>Bocardo Rider collects location data even when the app is closed or running in the background</strong>. This continuous tracking enables automated order dispatch to nearby riders, accurate delivery route estimation, and live tracking for the recipient customer and restaurant. Background tracking stops immediately when the rider toggles &quot;Off Duty&quot;.</li>
        </ul>

        <h3 className="text-lg font-semibold text-slate-800 mt-4 mb-2">C. Camera and Photo Library Data</h3>
        <ul className="list-disc pl-6 space-y-1 text-slate-700">
          <li><strong>Proof of Delivery:</strong> Delivery riders may use the camera to photograph delivered orders as contactless proof of completion.</li>
          <li><strong>KYC &amp; Outlet Verification:</strong> Partners and riders upload scans or camera photos of regulatory certificates, licences, and menu dishes. We only access the photo library or camera when explicitly initiated by the user.</li>
        </ul>

        <h3 className="text-lg font-semibold text-slate-800 mt-4 mb-2">D. Payment and Financial Data</h3>
        <p className="text-slate-700 leading-relaxed">
          Customer payments are processed through secure, PCI-DSS compliant third-party payment gateways (such as Razorpay). Bocardo does not store full credit card numbers, debit card numbers, or CVV details on our servers.
        </p>

        <h3 className="text-lg font-semibold text-slate-800 mt-4 mb-2">E. Device and Technical Data</h3>
        <ul className="list-disc pl-6 space-y-1 text-slate-700">
          <li><strong>Push Notification Tokens:</strong> Firebase Cloud Messaging (FCM) device tokens to send order updates, dispatch notices, and delivery alerts.</li>
          <li><strong>Device &amp; Security Telemetry:</strong> Device model, operating system version, and Firebase App Check integrity tokens to prevent SMS toll fraud and bot abuse.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">3. How We Use Your Information</h2>
        <ul className="list-disc pl-6 space-y-1 text-slate-700">
          <li>To create and manage user accounts securely via mobile OTP.</li>
          <li>To facilitate order placement, restaurant preparation, delivery assignment, and real-time transit tracking.</li>
          <li>To verify regulatory compliance and credentials for restaurant partners and delivery riders.</li>
          <li>To process transactions, refunds, and partner payouts.</li>
          <li>To provide customer support and resolve order tickets.</li>
          <li>To detect, investigate, and prevent fraudulent transactions, platform abuse, and security incidents.</li>
          <li>To comply with applicable tax, financial, and statutory regulations.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">4. Third-Party Service Providers</h2>
        <p className="text-slate-700 leading-relaxed">
          We partner with reputable infrastructure providers who process data strictly on our behalf under contractual privacy safeguards:
        </p>
        <ul className="list-disc pl-6 space-y-1 text-slate-700 mt-2">
          <li><strong>Supabase:</strong> Cloud database, authentication, and encrypted storage.</li>
          <li><strong>Firebase (Google LLC):</strong> Cloud Messaging (push notifications) and Firebase App Check (bot and fraud mitigation).</li>
          <li><strong>Razorpay:</strong> PCI-DSS certified payment processing and payouts.</li>
          <li><strong>Mapbox &amp; Google Maps:</strong> Geocoding, map tile rendering, and routing calculations.</li>
        </ul>
        <p className="text-slate-700 leading-relaxed mt-2">
          <strong>We never sell, rent, or trade your personal data to third parties for advertising or tracking purposes.</strong>
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">5. Data Retention and Security</h2>
        <p className="text-slate-700 leading-relaxed">
          We employ industry-standard technical measures including TLS 1.3 encryption in transit, encrypted storage at rest, row-level security (RLS), and principle-of-least-privilege access controls.
        </p>
        <p className="text-slate-700 leading-relaxed mt-2">
          Personal data is retained only for as long as necessary to fulfill platform operations. Transaction records, invoices, and ledger entries are retained as mandated by applicable statutory accounting and tax regulations.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">6. User Rights &amp; Account Deletion</h2>
        <p className="text-slate-700 leading-relaxed">
          Every user has the right to access, rectify, or delete their personal account and associated data.
        </p>
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl mt-3 space-y-2">
          <p className="font-semibold text-slate-800">How to Delete Your Account:</p>
          <ul className="list-disc pl-6 space-y-1 text-slate-700 text-sm">
            <li><strong>In-App:</strong> Open the Bocardo app, go to <em>Account</em> or <em>Profile</em>, and tap <em>Delete account</em>.</li>
            <li><strong>Online Web Form:</strong> If you no longer have access to the app, visit our <Link href="/delete-account" className="text-sky-600 font-semibold underline">Account Deletion Request Page</Link> to submit a deletion request.</li>
          </ul>
          <p className="text-xs text-slate-500 mt-2">
            Upon deletion, your profile, contact numbers, device tokens, and saved addresses are permanently removed or anonymised. Statutory tax and completed order accounting rows are retained where required by law.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">7. Children&apos;s Privacy</h2>
        <p className="text-slate-700 leading-relaxed">
          Our Services are not directed to individuals under the age of 18. We do not knowingly collect personal information from minors.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">8. Contact Us &amp; Grievance Officer</h2>
        <p className="text-slate-700 leading-relaxed">
          If you have questions, concerns, or requests regarding this Privacy Policy or your personal information, please contact our Grievance Officer:
        </p>
        <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-700 space-y-1">
          <p><strong>Bocardo Technologies Grievance Desk</strong></p>
          <p>Email: <a href="mailto:privacy@bocardo.app" className="text-sky-600 underline">privacy@bocardo.app</a></p>
          <p>Support: <a href="mailto:support@bocardo.app" className="text-sky-600 underline">support@bocardo.app</a></p>
        </div>
      </section>
    </article>
  );
}
