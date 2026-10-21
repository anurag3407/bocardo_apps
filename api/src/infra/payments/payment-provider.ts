export interface CreatedPaymentOrder {
  providerOrderId: string;
  amountPaise: number;
  currency: 'INR';
  /** Public key the app passes to the checkout SDK. */
  publicKey: string;
}

export interface PaymentProvider {
  readonly name: 'razorpay' | 'mock';
  /** Public key the apps pass to the checkout SDK. */
  readonly publicKey: string;
  createOrder(input: {
    amountPaise: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<CreatedPaymentOrder>;
  /** Signature returned to the app after checkout. Never trust the client without this. */
  verifyPaymentSignature(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }): boolean;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  refund(input: {
    providerPaymentId: string;
    amountPaise: number;
    notes: Record<string, string>;
  }): Promise<{ providerRefundId: string }>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
