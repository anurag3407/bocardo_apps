import { getAuth } from 'firebase-admin/auth';
import { AppError } from '../../common/errors/app-error';
import { loadEnv } from '../../config/env';
import { OtpService } from './otp.service';

let mockSqlRows: Array<{ id: string }> = [];

jest.mock('kysely', () => ({
  sql: () => ({
    execute: jest.fn(async () => ({ rows: mockSqlRows })),
  }),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(),
}));

jest.mock('firebase-admin/app-check', () => ({
  getAppCheck: jest.fn(),
}));

function makeService(overrides?: {
  firebase?: object | null;
  serviceRoleKey?: string;
  existingUserId?: string;
}) {
  mockSqlRows = overrides?.existingUserId ? [{ id: overrides.existingUserId }] : [];
  const kv = { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn() };
  const sms = { name: 'log' as const, sendOtp: jest.fn() };
  const env = loadEnv({
    NODE_ENV: 'test',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: overrides?.serviceRoleKey ?? 'srv-secret',
  });
  const human = { verify: jest.fn() };
  const config = {
    get: jest.fn().mockResolvedValue({ allowedCountryCodes: ['91'], hourlyBudget: 5000 }),
  };
  const realtime = { publish: jest.fn() };

  const svc = new OtpService(
    {} as never,
    kv as never,
    sms,
    env,
    overrides?.firebase === undefined ? ({} as never) : (overrides.firebase as never),
    human as never,
    config as never,
    realtime as never,
  );
  return { svc };
}

describe('OtpService.exchangeFirebasePhone', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    mockSqlRows = [];
    jest.resetAllMocks();
  });

  it('rejects when Firebase is not configured', async () => {
    const { svc } = makeService({ firebase: null });
    await expect(
      svc.exchangeFirebasePhone({ idToken: 'tok-1234567890', ip: '1.2.3.4' }),
    ).rejects.toThrow(AppError);
  });

  it('rejects invalid Firebase ID tokens', async () => {
    (getAuth as jest.Mock).mockReturnValue({
      verifyIdToken: jest.fn().mockRejectedValue(new Error('bad token')),
    });
    const { svc } = makeService();
    await expect(
      svc.exchangeFirebasePhone({ idToken: 'bad-token-1234', ip: '1.2.3.4' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects non-Indian phone numbers', async () => {
    (getAuth as jest.Mock).mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: 'u1', phone_number: '+14155551234' }),
    });
    const { svc } = makeService();
    await expect(
      svc.exchangeFirebasePhone({ idToken: 'ok-token-12345', ip: '1.2.3.4' }),
    ).rejects.toMatchObject({ code: 'COUNTRY_NOT_SUPPORTED' });
  });

  it('creates a Supabase user and exchanges for a session when phone is new', async () => {
    (getAuth as jest.Mock).mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: 'u1', phone_number: '+919876543210' }),
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'supa-uuid-1' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'acc-1', refresh_token: 'ref-1' }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { svc } = makeService();
    const res = await svc.exchangeFirebasePhone({ idToken: 'ok-token-12345', ip: '1.2.3.4' });
    expect(res).toEqual({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.supabase.co/auth/v1/admin/users');
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://example.supabase.co/auth/v1/token?grant_type=password',
    );
  });

  it('updates an existing Supabase user and returns a fresh session', async () => {
    (getAuth as jest.Mock).mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: 'u1', phone_number: '+919876543210' }),
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'supa-existing' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'acc-2', refresh_token: 'ref-2' }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { svc } = makeService({ existingUserId: 'supa-existing' });
    const res = await svc.exchangeFirebasePhone({ idToken: 'ok-token-12345', ip: '1.2.3.4' });
    expect(res).toEqual({ accessToken: 'acc-2', refreshToken: 'ref-2' });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://example.supabase.co/auth/v1/admin/users/supa-existing',
    );
  });

  it('omits Authorization Bearer header when using new sb_secret_ key', async () => {
    (getAuth as jest.Mock).mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: 'u1', phone_number: '+919876543210' }),
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'supa-uuid-1' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'acc-3', refresh_token: 'ref-3' }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { svc } = makeService({ serviceRoleKey: 'sb_secret_test_123' });
    const res = await svc.exchangeFirebasePhone({ idToken: 'ok-token-12345', ip: '1.2.3.4' });
    expect(res).toEqual({ accessToken: 'acc-3', refreshToken: 'ref-3' });
    const adminCallHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(adminCallHeaders.apikey).toBe('sb_secret_test_123');
    expect(adminCallHeaders.Authorization).toBeUndefined();
  });
});
