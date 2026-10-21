import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v : undefined));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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

    RAZORPAY_KEY_ID: optionalString,
    RAZORPAY_KEY_SECRET: optionalString,
    RAZORPAY_WEBHOOK_SECRET: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    // In-memory/dev fallbacks are unsafe with more than one instance — require real providers.
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
