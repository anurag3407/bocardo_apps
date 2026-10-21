import { Global, Logger, Module } from '@nestjs/common';
import { Client } from '@upstash/qstash';
import type { App } from 'firebase-admin/app';
import { ENV, type Env } from '../config/env';
import { DatabaseModule } from './database/database.module';
import { createFirebaseApp, FIREBASE_APP } from './firebase/firebase-app';
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
import { HumanVerifier } from './security/human-verifier';
import { LogSmsSender } from './sms/log-sms-sender';
import { Msg91SmsSender } from './sms/msg91-sms-sender';
import { SMS_SENDER } from './sms/sms-sender';
import { StorageService } from './storage/storage.service';
import { DirectTelephonyProvider } from './telephony/direct-telephony-provider';
import { ExotelTelephonyProvider } from './telephony/exotel-telephony-provider';
import { TELEPHONY_PROVIDER } from './telephony/telephony-provider';
import { TwilioTelephonyProvider } from './telephony/twilio-telephony-provider';

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
    HumanVerifier,
    StorageService,
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
    { provide: FIREBASE_APP, inject: [ENV], useFactory: createFirebaseApp },
    {
      provide: PUSH_SENDER,
      inject: [FIREBASE_APP],
      useFactory: (app: App | null) => (app ? new FcmPushSender(app) : new LogPushSender()),
    },
    {
      provide: TELEPHONY_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env) => {
        if (env.TELEPHONY_PROVIDER === 'exotel') {
          if (
            !env.EXOTEL_SID ||
            !env.EXOTEL_API_KEY ||
            !env.EXOTEL_API_TOKEN ||
            !env.EXOTEL_CALLER_ID
          )
            throw new Error('EXOTEL_* settings are required');
          return new ExotelTelephonyProvider({
            sid: env.EXOTEL_SID,
            apiKey: env.EXOTEL_API_KEY,
            apiToken: env.EXOTEL_API_TOKEN,
            subdomain: env.EXOTEL_SUBDOMAIN,
            callerId: env.EXOTEL_CALLER_ID,
          });
        }
        if (env.TELEPHONY_PROVIDER === 'twilio') {
          if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_CALLER_ID)
            throw new Error('TWILIO_* settings are required');
          return new TwilioTelephonyProvider({
            accountSid: env.TWILIO_ACCOUNT_SID,
            authToken: env.TWILIO_AUTH_TOKEN,
            callerId: env.TWILIO_CALLER_ID,
          });
        }
        logger.warn('TELEPHONY_PROVIDER=direct — calls expose real numbers (development only)');
        return new DirectTelephonyProvider();
      },
    },
    {
      provide: SMS_SENDER,
      inject: [ENV],
      useFactory: (env: Env) => {
        if (env.SMS_PROVIDER === 'msg91') {
          if (!env.MSG91_AUTH_KEY || !env.MSG91_OTP_TEMPLATE_ID)
            throw new Error('MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID are required');
          return new Msg91SmsSender({
            authKey: env.MSG91_AUTH_KEY,
            templateId: env.MSG91_OTP_TEMPLATE_ID,
            senderId: env.SMS_SENDER_ID,
            dltEntityId: env.DLT_PRINCIPAL_ENTITY_ID,
            dltTemplateId: env.DLT_OTP_TEMPLATE_ID,
          });
        }
        return new LogSmsSender();
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
    TELEPHONY_PROVIDER,
    SMS_SENDER,
    FIREBASE_APP,
    RealtimePublisher,
    HumanVerifier,
    StorageService,
  ],
})
export class InfraModule {}
