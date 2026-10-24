import { Logger } from '@nestjs/common';
import { cert, initializeApp, type App } from 'firebase-admin/app';
import { readFileSync } from 'node:fs';
import type { Env } from '../../config/env';

export const FIREBASE_APP = Symbol('FIREBASE_APP');

/** One Firebase Admin app for push (FCM) and App Check; null when credentials are absent. */
export function createFirebaseApp(env: Env): App | null {
  const raw = env.FIREBASE_SERVICE_ACCOUNT_BASE64
    ? Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
    : env.FIREBASE_SERVICE_ACCOUNT_PATH
      ? readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8')
      : undefined;
  if (!raw) {
    new Logger('Firebase').warn(
      'Firebase service account not set — push is logged only, App Check is not verified',
    );
    return null;
  }
  return initializeApp({ credential: cert(JSON.parse(raw)) }, 'bocardo');
}
