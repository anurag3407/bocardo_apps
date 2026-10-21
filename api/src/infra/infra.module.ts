import { Global, Logger, Module } from '@nestjs/common';
import { Client } from '@upstash/qstash';
import { cert, initializeApp } from 'firebase-admin/app';
import { readFileSync } from 'node:fs';
import { ENV, type Env } from '../config/env';
import { DatabaseModule } from './database/database.module';
import { GEO_PROVIDER } from './geo/geo-provider';
import { HaversineGeoProvider } from './geo/haversine-geo-provider';
import { MapboxGeoProvider } from './geo/mapbox-geo-provider';
import { JobRegistry, JOB_SCHEDULER } from './jobs/jobs';
import { JobsController } from './jobs/jobs.controller';
import { LocalJobScheduler } from './jobs/local-job-scheduler';
import { QStashJobScheduler } from './jobs/qstash-job-scheduler';
import { KvModule } from './kv/kv.module';
import { MockPaymentProvider } from './payments/mock-payment-provider';
import { PAYMENT_PROVIDER } from './payments/payment-provider';
import { RazorpayPaymentProvider } from './payments/razorpay-payment-provider';
import { FcmPushSender } from './push/fcm-push-sender';
import { LogPushSender } from './push/log-push-sender';
import { PUSH_SENDER } from './push/push-sender';
import { RealtimePublisher } from './realtime/realtime-publisher';

const logger = new Logger('InfraModule');

/**
 * Binds every external-service port to its adapter. Each adapter has a local fallback so the
 * API runs with zero credentials in development; production config validation forbids fallbacks.
 */
@Global()
@Module({
  imports: [DatabaseModule, KvModule],
  controllers: [JobsController],
  providers: [
    JobRegistry,
    RealtimePublisher,
    {
      provide: JOB_SCHEDULER,
      inject: [ENV, JobRegistry],
      useFactory: (env: Env, registry: JobRegistry) => {
        if (env.QSTASH_TOKEN)
          return new QStashJobScheduler(
            new Client({ token: env.QSTASH_TOKEN }),
            env.API_PUBLIC_URL,
          );
        logger.warn('QSTASH_TOKEN not set — delayed jobs run on in-process timers');
        return new LocalJobScheduler(registry);
      },
    },
    {
      provide: PUSH_SENDER,
      inject: [ENV],
      useFactory: (env: Env) => {
        const raw = env.FIREBASE_SERVICE_ACCOUNT_BASE64
          ? Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
          : env.FIREBASE_SERVICE_ACCOUNT_PATH
            ? readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8')
            : undefined;
        if (!raw) {
          logger.warn('Firebase service account not set — push notifications are logged only');
          return new LogPushSender();
        }
        return new FcmPushSender(initializeApp({ credential: cert(JSON.parse(raw)) }, 'bocardo'));
      },
    },
    {
      provide: GEO_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env) => {
        if (env.GEO_PROVIDER === 'google')
          throw new Error('Google Maps provider not implemented yet — set GEO_PROVIDER=mapbox');
        if (env.MAPBOX_ACCESS_TOKEN) return new MapboxGeoProvider(env.MAPBOX_ACCESS_TOKEN);
        logger.warn('MAPBOX_ACCESS_TOKEN not set — using straight-line distance estimates');
        return new HaversineGeoProvider();
      },
    },
    {
      provide: PAYMENT_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env) => {
        if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) {
          return new RazorpayPaymentProvider(
            env.RAZORPAY_KEY_ID,
            env.RAZORPAY_KEY_SECRET,
            env.RAZORPAY_WEBHOOK_SECRET,
          );
        }
        logger.warn('RAZORPAY_* not set — using mock payment provider');
        return new MockPaymentProvider();
      },
    },
  ],
  exports: [
    DatabaseModule,
    KvModule,
    JobRegistry,
    JOB_SCHEDULER,
    PUSH_SENDER,
    GEO_PROVIDER,
    PAYMENT_PROVIDER,
    RealtimePublisher,
  ],
})
export class InfraModule {}
