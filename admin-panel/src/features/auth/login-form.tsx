'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { supabase } from '@/core/auth/supabase-browser';

/** Email + password, then TOTP when the admin has MFA enrolled (required for production admins). */
export function LoginForm({ notAdmin }: { notAdmin: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfa, setMfa] = useState<{ factorId: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(notAdmin ? 'This account does not have console access.' : null);
  const [loading, setLoading] = useState(false);

  const finish = async () => {
    // new JWT may carry freshly granted admin claims
    await supabase.auth.refreshSession();
    router.replace('/');
    router.refresh();
  };

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp[0];
      if (totp) {
        setMfa({ factorId: totp.id });
        setLoading(false);
        return;
      }
    }
    await finish();
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (!mfa) return;
    setLoading(true);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfa.factorId, code });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    await finish();
  };

  return (
    <Card className="w-full max-w-sm">
      <div className="mb-4">
        <div className="text-2xl font-black text-brand">bocardo</div>
        <div className="text-sm text-muted">Operations console</div>
      </div>
      {mfa ? (
        <form onSubmit={verify} className="flex flex-col gap-3">
          <Input label="Authenticator code" inputMode="numeric" autoFocus maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
          <Button type="submit" loading={loading}>Verify</Button>
        </form>
      ) : (
        <form onSubmit={signIn} className="flex flex-col gap-3">
          <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" loading={loading}>Sign in</Button>
        </form>
      )}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </Card>
  );
}
