import { loadEnv } from './env';

const prodBase = {
  NODE_ENV: 'production',
  APP_SECRET: '0123456789abcdef0123456789abcdef',
  DATABASE_URL: 'postgresql://postgres:pass@db.example.com:6543/postgres',
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'srv-key',
  UPSTASH_REDIS_REST_URL: 'https://redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'redis-token',
  QSTASH_TOKEN: 'qstash-token',
  QSTASH_CURRENT_SIGNING_KEY: 'sig-1',
  QSTASH_NEXT_SIGNING_KEY: 'sig-2',
  RAZORPAY_KEY_ID: 'rzp_live_123',
  RAZORPAY_KEY_SECRET: 'rzp-secret',
  RAZORPAY_WEBHOOK_SECRET: 'rzp-webhook',
  TELEPHONY_PROVIDER: 'exotel',
  TELEPHONY_WEBHOOK_TOKEN: 'tel-token',
  OTP_HUMAN_CHECK: 'required',
  SUPABASE_SEND_SMS_HOOK_SECRET: 'v1,whsec_test',
  SMS_PROVIDER: 'msg91',
  MSG91_AUTH_KEY: 'msg91-key',
  MSG91_OTP_TEMPLATE_ID: 'tpl-123',
};

describe('loadEnv', () => {
  it('allows dev defaults in development', () => {
    const env = loadEnv({ NODE_ENV: 'development' });
    expect(env.SMS_PROVIDER).toBe('log');
    expect(env.TELEPHONY_PROVIDER).toBe('direct');
  });

  it('rejects SMS_PROVIDER=log in strict production', () => {
    expect(() => loadEnv({ ...prodBase, SMS_PROVIDER: 'log' })).toThrow(/SMS_PROVIDER/);
  });

  it('rejects DEV_OTP_WEBHOOK_URL in strict production', () => {
    expect(() =>
      loadEnv({ ...prodBase, DEV_OTP_WEBHOOK_URL: 'https://ntfy.sh/bocardo-test' }),
    ).toThrow(/DEV_OTP_WEBHOOK_URL/);
  });

  it('accepts twilio SMS credentials in strict production', () => {
    const env = loadEnv({
      ...prodBase,
      SMS_PROVIDER: 'twilio',
      MSG91_AUTH_KEY: undefined,
      MSG91_OTP_TEMPLATE_ID: undefined,
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'auth',
      TWILIO_MESSAGE_SERVICE_SID: 'MG123',
    });
    expect(env.SMS_PROVIDER).toBe('twilio');
  });
});
