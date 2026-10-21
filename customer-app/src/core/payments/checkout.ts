import RazorpayCheckout from 'react-native-razorpay';

export interface PaymentSession {
  provider: 'razorpay' | 'mock';
  providerOrderId: string;
  amountPaise: number;
  currency: 'INR';
  publicKey: string;
}

export interface CheckoutResult {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}

export class CheckoutCancelled extends Error {
  constructor() {
    super('Payment was cancelled');
  }
}

/**
 * Opens the gateway's native checkout. The result is only a claim — the API verifies the
 * signature (and the webhook confirms independently) before the order is placed.
 */
export async function openCheckout(
  session: PaymentSession,
  prefill: { name?: string | null; phone?: string | null; description: string },
): Promise<CheckoutResult> {
  if (session.provider === 'mock') {
    // local development without Razorpay keys
    return { providerOrderId: session.providerOrderId, providerPaymentId: `pay_mock_${Date.now()}`, signature: 'mock_ok' };
  }
  try {
    const res = (await RazorpayCheckout.open({
      key: session.publicKey,
      order_id: session.providerOrderId,
      amount: session.amountPaise,
      currency: session.currency,
      name: 'Bocardo',
      description: prefill.description,
      prefill: { name: prefill.name ?? undefined, contact: prefill.phone ?? undefined },
      theme: { color: '#FF5A1F' },
    })) as { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
    return { providerOrderId: res.razorpay_order_id, providerPaymentId: res.razorpay_payment_id, signature: res.razorpay_signature };
  } catch (err) {
    const code = (err as { code?: number }).code;
    // 0 = user closed the sheet / payment cancelled
    if (code === 0 || code === 2) throw new CheckoutCancelled();
    throw new Error((err as { description?: string }).description ?? 'Payment failed');
  }
}
