import { createHmac, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';
import type { CreatedPaymentOrder, PaymentProvider } from './payment-provider';

const safeEqualHex = (a: string, b: string) => {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
};

export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;
  private readonly client: Razorpay;

  get publicKey() {
    return this.keyId;
  }

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret?: string,
  ) {
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  async createOrder(input: {
    amountPaise: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<CreatedPaymentOrder> {
    const order = await this.client.orders.create({
      amount: input.amountPaise,
      currency: 'INR',
      receipt: input.receipt.slice(0, 40),
      notes: input.notes,
    });
    return {
      providerOrderId: order.id,
      amountPaise: Number(order.amount),
      currency: 'INR',
      publicKey: this.keyId,
    };
  }

  verifyPaymentSignature({
    providerOrderId,
    providerPaymentId,
    signature,
  }: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }) {
    const expected = createHmac('sha256', this.keySecret)
      .update(`${providerOrderId}|${providerPaymentId}`)
      .digest('hex');
    return safeEqualHex(expected, signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string) {
    if (!this.webhookSecret) return false;
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return safeEqualHex(expected, signature);
  }

  async refund({
    providerPaymentId,
    amountPaise,
    notes,
  }: {
    providerPaymentId: string;
    amountPaise: number;
    notes: Record<string, string>;
  }) {
    const refund = await this.client.payments.refund(providerPaymentId, {
      amount: amountPaise,
      speed: 'normal',
      notes,
    });
    return { providerRefundId: refund.id };
  }
}
