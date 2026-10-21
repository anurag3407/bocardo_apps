import { Logger } from '@nestjs/common';
import type { SmsSender } from './sms-sender';

/** Development: prints the OTP instead of sending it. */
export class LogSmsSender implements SmsSender {
  readonly name = 'log' as const;
  private readonly logger = new Logger('Sms');

  async sendOtp(phone: string, otp: string) {
    this.logger.log(`OTP for ${phone.slice(0, 4)}…${phone.slice(-2)}: ${otp}`);
  }
}
