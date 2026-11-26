import { verifyDeploySecret } from './deploy-secret';

describe('verifyDeploySecret', () => {
  const secret = 'super-secret-deploy-key';

  it('accepts exact matching secret', () => {
    expect(verifyDeploySecret(secret, secret)).toBe(true);
  });

  it('rejects missing or mismatched secret', () => {
    expect(verifyDeploySecret(undefined, secret)).toBe(false);
    expect(verifyDeploySecret('', secret)).toBe(false);
    expect(verifyDeploySecret('wrong', secret)).toBe(false);
    expect(verifyDeploySecret('super-secret-deploy-kez', secret)).toBe(false);
  });
});
