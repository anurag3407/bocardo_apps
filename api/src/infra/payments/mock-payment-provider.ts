import { randomUUID } from 'node:crypto';
import type { CreatedPaymentOrder, PaymentProvider } from './payment-provider';

/**
 * Dev/test stand-in for Razorpay. Any payment verifies with signature "mock_ok",
 * which lets the apps and e2e tests exercise the full online-payment path offline.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock' as const;
  readonly publicKey = 'rzp_test_mock';
  static readonly VALID_SIGNATURE = 'mock_ok';

  async createOrder(input: { amountPaise: number }): Promise<CreatedPaymentOrder> {
    return {
      providerOrderId: `order_mock_${randomUUID()}`,
      amountPaise: input.amountPaise,
      currency: 'INR',
      publicKey: this.publicKey,
    };
  }

  verifyPaymentSignature({ signature }: { signature: string }) {
    return signature === MockPaymentProvider.VALID_SIGNATURE;
  }

  verifyWebhookSignature(_rawBody: string, signature: string) {
    return signature === MockPaymentProvider.VALID_SIGNATURE;
  }

  async refund() {
    return { providerRefundId: `rfnd_mock_${randomUUID()}` };
  }
}
