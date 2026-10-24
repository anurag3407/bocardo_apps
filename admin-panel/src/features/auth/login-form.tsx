'use client';

import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, ErrorNote, Input, Logo } from '@/components/ui';
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
    <div className="w-full max-w-sm">
      <div className="mb-8">
        <Logo size={40} className="mb-8 lg:hidden" />
        <h2 className="text-2xl font-extrabold tracking-tight">{mfa ? 'Two-step verification' : 'Welcome back'}</h2>
        <p className="mt-1 text-sm text-muted">{mfa ? 'Enter the 6-digit code from your authenticator app.' : 'Sign in to the operations console.'}</p>
      </div>
      {mfa ? (
        <form onSubmit={verify} className="flex flex-col gap-4">
          <Input label="Authenticator code" inputMode="numeric" autoFocus maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} className="h-11 text-center font-mono text-lg tracking-[0.5em]" />
          <Button type="submit" loading={loading} className="h-11">Verify</Button>
        </form>
      ) : (
        <form onSubmit={signIn} className="flex flex-col gap-4">
          <Input label="Email" type="email" autoComplete="email" placeholder="you@bocardo.app" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
          <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
          <Button type="submit" loading={loading} className="mt-2 h-11">Sign in</Button>
        </form>
      )}
      {error ? <div className="mt-4"><ErrorNote error={new Error(error)} /></div> : null}
      <p className="mt-8 flex items-center gap-1.5 text-xs text-subtle">
        <ShieldCheck className="size-3.5" aria-hidden />
        Admin access is audited. MFA is required in production.
      </p>
    </div>
  );
}
