import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service - Bocardo',
  description: 'Terms of Service for Bocardo Customer, Bocardo Partner, and Bocardo Rider platforms.',
};

export default function TermsOfServicePage() {
  return (
    <article className="prose prose-slate max-w-none bg-white p-6 sm:p-10 rounded-2xl shadow-sm border border-slate-200">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-2">Bocardo Terms of Service</h1>
      <p className="text-sm text-slate-500 mb-8">Effective Date: November 9, 2026 · Last Updated: November 9, 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">1. Agreement to Terms</h2>
        <p className="text-slate-700 leading-relaxed">
          These Terms of Service (&quot;Terms&quot;) constitute a legally binding agreement between you and Bocardo Technologies (&quot;Bocardo&quot;, &quot;we&quot;, &quot;us&quot;) governing your access to and use of our mobile applications (Bocardo Customer, Bocardo Partner, Bocardo Rider) and related services.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">2. Platform Role</h2>
        <p className="text-slate-700 leading-relaxed">
          Bocardo provides an online marketplace platform connecting customers with independent local food outlets (&quot;Restaurant Partners&quot;) and independent logistics providers (&quot;Delivery Partners&quot;). Bocardo is an intermediary technology platform and is not itself a food vendor, restaurant, or courier employer.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">3. User Accounts &amp; Security</h2>
        <ul className="list-disc pl-6 space-y-1 text-slate-700">
          <li>You must provide accurate and verifiable mobile contact information when signing up.</li>
          <li>You are responsible for maintaining the confidentiality of verification codes received.</li>
          <li>You may terminate your account at any time directly through the app or by submitting a request via our <Link href="/delete-account" className="text-sky-600 underline">Account Deletion Page</Link>.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">4. Customer Ordering &amp; Payments</h2>
        <ul className="list-disc pl-6 space-y-1 text-slate-700">
          <li><strong>Prices &amp; Taxes:</strong> Prices displayed on menus are determined by Restaurant Partners. Applicable taxes, packaging charges, and delivery fees are calculated prior to checkout.</li>
          <li><strong>Payment Methods:</strong> Orders may be paid online via supported payment methods (UPI, credit/debit cards, net banking via Razorpay) or Cash on Delivery (COD) where available.</li>
          <li><strong>Cancellations &amp; Refunds:</strong> Once a restaurant has accepted and begun preparing an order, cancellations may incur a fee. If an order cannot be fulfilled, refunds are initiated promptly to the original payment method.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">5. Restaurant Partner Obligations</h2>
        <ul className="list-disc pl-6 space-y-1 text-slate-700">
          <li>Partners warrant that all food prepared complies with applicable health and safety laws, Food Safety and Standards Authority regulations (FSSAI), and licensing requirements.</li>
          <li>Partners agree to keep pricing, stock availability, preparation times, and outlet operating hours updated on the Bocardo Partner app.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">6. Delivery Partner Obligations</h2>
        <ul className="list-disc pl-6 space-y-1 text-slate-700">
          <li>Delivery partners operate as independent third-party service contractors.</li>
          <li>Riders agree to operate vehicles safely, follow all road traffic rules, maintain valid vehicle insurance and driving licences, and provide prompt contactless delivery verification where requested.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">7. Disclaimers and Limitation of Liability</h2>
        <p className="text-slate-700 leading-relaxed">
          The platform is provided &quot;as is&quot; without warranties of any kind. Bocardo is not liable for indirect, incidental, or consequential damages resulting from third-party vendor performance, delivery transit disruptions, or technical downtime beyond reasonable control.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">8. Governing Law &amp; Dispute Resolution</h2>
        <p className="text-slate-700 leading-relaxed">
          These Terms are governed by and construed in accordance with the laws of India. Any disputes arising out of or in connection with these Terms shall be subject to the exclusive jurisdiction of the competent courts in India.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-3">9. Contact Us</h2>
        <p className="text-slate-700 leading-relaxed">
          For queries regarding these Terms, please contact us at <a href="mailto:support@bocardo.app" className="text-sky-600 underline">support@bocardo.app</a>.
        </p>
      </section>
    </article>
  );
}
