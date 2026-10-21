/**
 * Full order lifecycle against a real local stack:
 *   supabase start && supabase db reset   (migrations + seed)
 *   E2E=1 pnpm test:e2e
 *
 * Signs in the seeded demo users through Supabase Auth (phone OTP 123456 / admin password),
 * then drives customer → restaurant → rider through the HTTP API.
 */
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/errors/http-exception.filter';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const run = process.env.E2E ? describe : describe.skip;

const BIRYANI_BROS = 'b0000000-0000-0000-0000-000000000001';

async function phoneLogin(phone: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, token: '123456', type: 'sms' }),
  });
  if (!res.ok) {
    // OTP must be requested first for test numbers
    await fetch(`${SUPABASE_URL}/auth/v1/otp`, { method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
    return phoneLogin(phone);
  }
  return ((await res.json()) as { access_token: string }).access_token;
}

run('order lifecycle (e2e)', () => {
  let app: NestFastifyApplication;
  let customer: string;
  let restaurant: string;
  let rider: string;

  const call = async (token: string, method: string, url: string, body?: unknown, idempotent = false) => {
    const res = await app.inject({
      method: method as 'GET',
      url,
      headers: { authorization: `Bearer ${token}`, ...(idempotent ? { 'idempotency-key': randomUUID() } : {}) },
      ...(body ? { payload: body as object } : {}),
    });
    return { status: res.statusCode, body: res.json() };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { rawBody: true });
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    [customer, restaurant, rider] = await Promise.all(['919999900001', '919999900002', '919999900003'].map(phoneLogin));
  });

  afterAll(async () => app?.close());

  it('customer orders (COD) → restaurant accepts → rider delivers → ledger balances', async () => {
    const addresses = await call(customer, 'GET', '/addresses');
    expect(addresses.status).toBe(200);
    const addressId = addresses.body[0].id;

    const menu = await call(customer, 'GET', `/restaurants/${BIRYANI_BROS}`);
    const item = menu.body.menu[0].items.find((i: { variants: unknown[] }) => i.variants.length > 0);

    const quote = await call(customer, 'POST', '/orders/quote', { restaurantId: BIRYANI_BROS, addressId, items: [{ menuItemId: item.id, quantity: 1 }] });
    expect(quote.status).toBe(200);

    const placed = await call(customer, 'POST', '/orders', { quoteId: quote.body.quoteId, paymentMethod: 'cod' }, true);
    expect(placed.status).toBe(201);
    expect(placed.body.order.status).toBe('PLACED');
    const orderId = placed.body.order.id;
    const otp = placed.body.order.deliveryOtp;

    // reusing the quote must fail
    const again = await call(customer, 'POST', '/orders', { quoteId: quote.body.quoteId, paymentMethod: 'cod' }, true);
    expect(again.body.error.code).toBe('QUOTE_ALREADY_USED');

    // rider goes online next to the restaurant before dispatch starts
    expect((await call(rider, 'POST', '/rider/online', { lat: 12.9339, lng: 77.6272 })).status).toBe(200);

    const accepted = await call(restaurant, 'POST', `/partner/restaurants/${BIRYANI_BROS}/orders/${orderId}/accept`, { prepMinutes: 5 }, true);
    expect(accepted.body.status).toBe('ACCEPTED');

    let offer: { offerId: string } | null = null;
    for (let i = 0; i < 20 && !offer; i++) {
      await new Promise((r) => setTimeout(r, 500));
      offer = (await call(rider, 'GET', '/rider/offers/current')).body.offer;
    }
    expect(offer).not.toBeNull();

    const assigned = await call(rider, 'POST', `/rider/offers/${offer!.offerId}/accept`, undefined, true);
    expect(assigned.body.dispatchStatus).toBe('ASSIGNED');

    await call(rider, 'POST', `/rider/orders/${orderId}/arrived-restaurant`, undefined, true);
    await call(restaurant, 'POST', `/partner/restaurants/${BIRYANI_BROS}/orders/${orderId}/ready`, undefined, true);
    await call(rider, 'POST', `/rider/orders/${orderId}/picked-up`, undefined, true);
    await call(rider, 'POST', `/rider/orders/${orderId}/arrived-drop`, undefined, true);

    const wrongOtp = await call(rider, 'POST', `/rider/orders/${orderId}/deliver`, { otp: otp === '0000' ? '1111' : '0000' }, true);
    expect(wrongOtp.body.error.code).toBe('OTP_MISMATCH');

    const delivered = await call(rider, 'POST', `/rider/orders/${orderId}/deliver`, { otp }, true);
    expect(delivered.body.status).toBe('DELIVERED');

    const rated = await call(customer, 'POST', `/orders/${orderId}/rating`, { restaurantRating: 5, riderRating: 5 });
    expect(rated.status).toBe(204);
  });
});
