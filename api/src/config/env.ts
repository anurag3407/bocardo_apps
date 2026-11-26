import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v : undefined));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Allow in-memory / direct / log fallback providers even when NODE_ENV=production (useful for staging / Render test deploys). */
    ALLOW_DEV_FALLBACKS: z.coerce.boolean().default(false),
    PORT: z.coerce.number().int().default(4000),
    API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    /** Server secret for derived values (delivery OTPs). Rotate with care: in-flight OTPs change. */
    APP_SECRET: z.string().min(16).default('dev-only-insecure-app-secret'),

    DATABASE_URL: z.string().default('postgresql://postgres:postgres@127.0.0.1:54322/postgres'),
    DATABASE_POOL_MAX: z.coerce.number().int().default(10),

    SUPABASE_URL: z.string().url().default('http://127.0.0.1:54321'),
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    SUPABASE_JWT_SECRET: optionalString,

    UPSTASH_REDIS_REST_URL: optionalString,
    UPSTASH_REDIS_REST_TOKEN: optionalString,

    QSTASH_TOKEN: optionalString,
    QSTASH_CURRENT_SIGNING_KEY: optionalString,
    QSTASH_NEXT_SIGNING_KEY: optionalString,

    FIREBASE_SERVICE_ACCOUNT_PATH: optionalString,
    FIREBASE_SERVICE_ACCOUNT_BASE64: optionalString,

    GEO_PROVIDER: z.enum(['mapbox', 'google']).default('mapbox'),
    MAPBOX_ACCESS_TOKEN: optionalString,
    GOOGLE_MAPS_API_KEY: optionalString,
    /** Hard daily caps on billable Google events; beyond them the API degrades to estimates. */
    MAPS_DAILY_ROUTE_ELEMENTS: z.coerce.number().int().positive().default(10_000),
    MAPS_DAILY_PLACES_CALLS: z.coerce.number().int().positive().default(10_000),

    TELEPHONY_PROVIDER: z.enum(['exotel', 'twilio', 'direct']).default('direct'),
    EXOTEL_SID: optionalString,
    EXOTEL_API_KEY: optionalString,
    EXOTEL_API_TOKEN: optionalString,
    EXOTEL_SUBDOMAIN: z.string().default('api.exotel.com'),
    EXOTEL_CALLER_ID: optionalString,
    TWILIO_ACCOUNT_SID: optionalString,
    TWILIO_AUTH_TOKEN: optionalString,
    TWILIO_CALLER_ID: optionalString,
    TWILIO_MESSAGE_SERVICE_SID: optionalString,
    TWILIO_FROM_NUMBER: optionalString,
    /** Shared secret appended to telephony status-callback URLs. */
    TELEPHONY_WEBHOOK_TOKEN: optionalString,

    SMS_PROVIDER: z.enum(['msg91', 'twilio', 'log']).default('log'),
    /** Optional webhook (e.g. ntfy.sh / Discord) for receiving test OTPs when SMS_PROVIDER=log. */
    DEV_OTP_WEBHOOK_URL: optionalString,
    MSG91_AUTH_KEY: optionalString,
    MSG91_OTP_TEMPLATE_ID: optionalString,
    /** TRAI DLT registration (India): principal entity + approved OTP content template + 6-char header. */
    DLT_PRINCIPAL_ENTITY_ID: optionalString,
    DLT_OTP_TEMPLATE_ID: optionalString,
    SMS_SENDER_ID: z.string().default('BOCRDO'),
    /** Supabase Auth "Send SMS" hook secret (v1,whsec_…). */
    SUPABASE_SEND_SMS_HOOK_SECRET: optionalString,

    TURNSTILE_SECRET_KEY: optionalString,
    /** Require Firebase App Check / Turnstile before an OTP can be requested. */
    OTP_HUMAN_CHECK: z.enum(['required', 'optional']).default('optional'),

    RAZORPAY_KEY_ID: optionalString,
    RAZORPAY_KEY_SECRET: optionalString,
    RAZORPAY_WEBHOOK_SECRET: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.DEV_OTP_WEBHOOK_URL) {
      try {
        new URL(env.DEV_OTP_WEBHOOK_URL);
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: ['DEV_OTP_WEBHOOK_URL'],
          message: 'must be a valid URL',
        });
      }
    }
    if (env.NODE_ENV !== 'production' || env.ALLOW_DEV_FALLBACKS) return;
    // In-memory/dev fallbacks are unsafe with more than one instance — require real providers.
    if (env.TELEPHONY_PROVIDER === 'direct') {
      ctx.addIssue({
        code: 'custom',
        path: ['TELEPHONY_PROVIDER'],
        message: 'direct dialing exposes phone numbers; use exotel or twilio',
      });
    }
    if (env.SMS_PROVIDER === 'log') {
      ctx.addIssue({
        code: 'custom',
        path: ['SMS_PROVIDER'],
        message: 'log does not send SMS; use msg91 or twilio',
      });
    }
    if (env.DEV_OTP_WEBHOOK_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['DEV_OTP_WEBHOOK_URL'],
        message: 'must not be set in production',
      });
    }
    if (env.SMS_PROVIDER === 'msg91' && (!env.MSG91_AUTH_KEY || !env.MSG91_OTP_TEMPLATE_ID)) {
      ctx.addIssue({
        code: 'custom',
        path: ['MSG91_AUTH_KEY'],
        message: 'MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID are required when SMS_PROVIDER=msg91',
      });
    }
    if (
      env.SMS_PROVIDER === 'twilio' &&
      (!env.TWILIO_ACCOUNT_SID ||
        !env.TWILIO_AUTH_TOKEN ||
        (!env.TWILIO_MESSAGE_SERVICE_SID && !env.TWILIO_FROM_NUMBER))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['TWILIO_ACCOUNT_SID'],
        message:
          'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGE_SERVICE_SID or TWILIO_FROM_NUMBER are required when SMS_PROVIDER=twilio',
      });
    }
    if (env.OTP_HUMAN_CHECK !== 'required') {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_HUMAN_CHECK'],
        message: 'must be "required" in production (SMS pumping protection)',
      });
    }
    if (env.APP_SECRET === 'dev-only-insecure-app-secret') {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_SECRET'],
        message: 'set a real secret in production',
      });
    }
    const required: (keyof typeof env)[] = [
      'SUPABASE_SERVICE_ROLE_KEY',
      'UPSTASH_REDIS_REST_URL',
      'UPSTASH_REDIS_REST_TOKEN',
      'QSTASH_TOKEN',
      'QSTASH_CURRENT_SIGNING_KEY',
      'QSTASH_NEXT_SIGNING_KEY',
      'RAZORPAY_KEY_ID',
      'RAZORPAY_KEY_SECRET',
      'RAZORPAY_WEBHOOK_SECRET',
      'TELEPHONY_WEBHOOK_TOKEN',
      'SUPABASE_SEND_SMS_HOOK_SECRET',
    ];
    for (const key of required) {
      if (!env[key])
        ctx.addIssue({ code: 'custom', path: [key], message: 'required in production' });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
