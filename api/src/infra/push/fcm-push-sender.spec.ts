import { getMessaging } from 'firebase-admin/messaging';
import { FcmPushSender } from './fcm-push-sender';

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(),
}));

describe('FcmPushSender', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('returns empty invalidTokens when given no tokens', async () => {
    const sender = new FcmPushSender({} as never);
    await expect(sender.send([], { title: 'Hi', body: 'Test' })).resolves.toEqual({
      invalidTokens: [],
    });
    expect(getMessaging).not.toHaveBeenCalled();
  });

  it('deduplicates tokens, sets ringing channel payload, and collects invalid tokens', async () => {
    const sendEachForMulticast = jest.fn().mockResolvedValue({
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        { success: false, error: { code: 'messaging/internal-error', message: 'transient' } },
      ],
    });
    (getMessaging as jest.Mock).mockReturnValue({ sendEachForMulticast });

    const sender = new FcmPushSender({} as never);
    const result = await sender.send(['tok-1', 'tok-1', 'tok-stale', 'tok-err'], {
      title: 'New order #1234',
      body: '₹299 — accept now',
      channel: 'orders',
      data: { orderId: 'ord-1', type: 'order_status' },
    });

    expect(result).toEqual({ invalidTokens: ['tok-stale'] });
    expect(sendEachForMulticast).toHaveBeenCalledWith({
      tokens: ['tok-1', 'tok-stale', 'tok-err'],
      notification: { title: 'New order #1234', body: '₹299 — accept now' },
      data: { orderId: 'ord-1', type: 'order_status', channel: 'orders' },
      android: {
        priority: 'high',
        notification: { channelId: 'orders', sound: 'order_ring' },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: {
          aps: { sound: 'order_ring.wav', 'interruption-level': 'time-sensitive' },
        },
      },
    });
  });

  it('chunks multicast calls at 500 tokens', async () => {
    const sendEachForMulticast = jest.fn().mockResolvedValue({
      responses: [],
    });
    (getMessaging as jest.Mock).mockReturnValue({ sendEachForMulticast });

    const sender = new FcmPushSender({} as never);
    const tokens = Array.from({ length: 502 }, (_, i) => `tok-${i}`);
    await sender.send(tokens, { title: 'Notice', body: 'Body' });

    expect(sendEachForMulticast).toHaveBeenCalledTimes(2);
    expect(sendEachForMulticast.mock.calls[0][0].tokens).toHaveLength(500);
    expect(sendEachForMulticast.mock.calls[1][0].tokens).toHaveLength(2);
  });
});
