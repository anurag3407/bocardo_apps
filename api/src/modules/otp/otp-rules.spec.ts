import { createHmac } from 'node:crypto';
import { normalizeOtpPhone, verifyStandardWebhook } from './otp-rules';

describe('normalizeOtpPhone', () => {
  it('accepts Indian mobiles in common formats', () => {
    expect(normalizeOtpPhone('98765 43210', ['91'])).toEqual({ ok: true, phone: '919876543210' });
    expect(normalizeOtpPhone('+91-9876543210', ['91'])).toEqual({
      ok: true,
      phone: '919876543210',
    });
  });

  it('rejects landlines/invalid prefixes and international destinations', () => {
    expect(normalizeOtpPhone('+91 2212345678', ['91'])).toMatchObject({
      ok: false,
      reason: 'INVALID_PHONE',
    });
    expect(normalizeOtpPhone('+44 7911 123456', ['91'])).toMatchObject({
      ok: false,
      reason: 'COUNTRY_NOT_SUPPORTED',
    });
    expect(normalizeOtpPhone('+882 1234 5678', ['91'])).toMatchObject({
      ok: false,
      reason: 'COUNTRY_NOT_SUPPORTED',
    });
  });
});

describe('verifyStandardWebhook', () => {
  const key = Buffer.from('super-secret-key-material');
  const secret = `v1,whsec_${key.toString('base64')}`;
  const body = '{"user":{"phone":"919876543210"},"sms":{"otp":"123456"}}';
  const sign = (id: string, ts: string, b: string) =>
    createHmac('sha256', key).update(`${id}.${ts}.${b}`).digest('base64');

  it('accepts a valid signature', () => {
    const ts = '1760000000';
    expect(
      verifyStandardWebhook(
        secret,
        { id: 'msg_1', timestamp: ts, signature: `v1,${sign('msg_1', ts, body)}` },
        body,
        1760000010,
      ),
    ).toBe(true);
  });

  it('accepts when one of several rotated signatures matches', () => {
    const ts = '1760000000';
    const header = `v1,AAAA v1,${sign('msg_1', ts, body)}`;
    expect(
      verifyStandardWebhook(
        secret,
        { id: 'msg_1', timestamp: ts, signature: header },
        body,
        1760000000,
      ),
    ).toBe(true);
  });

  it('rejects tampered bodies, stale timestamps and missing headers', () => {
    const ts = '1760000000';
    const sig = `v1,${sign('msg_1', ts, body)}`;
    expect(
      verifyStandardWebhook(
        secret,
        { id: 'msg_1', timestamp: ts, signature: sig },
        body.replace('123456', '000000'),
        1760000000,
      ),
    ).toBe(false);
    expect(
      verifyStandardWebhook(
        secret,
        { id: 'msg_1', timestamp: ts, signature: sig },
        body,
        1760009999,
      ),
    ).toBe(false);
    expect(verifyStandardWebhook(secret, { id: 'msg_1', timestamp: ts }, body, 1760000000)).toBe(
      false,
    );
  });
});
