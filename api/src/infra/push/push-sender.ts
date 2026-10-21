export type PushChannel = 'orders' | 'offers' | 'updates';

export interface PushMessage {
  title: string;
  body: string;
  /** All values must be strings (FCM data payload). */
  data?: Record<string, string>;
  /** Android channel. `orders`/`offers` ring loudly on the restaurant & rider apps. */
  channel?: PushChannel;
}

export interface PushSender {
  send(tokens: string[], message: PushMessage): Promise<{ invalidTokens: string[] }>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');
