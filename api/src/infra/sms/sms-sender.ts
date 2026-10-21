export interface SmsSender {
  readonly name: 'msg91' | 'log';
  /** `phone` in digits with country code, e.g. 919876543210. */
  sendOtp(phone: string, otp: string): Promise<void>;
}

export const SMS_SENDER = Symbol('SMS_SENDER');
