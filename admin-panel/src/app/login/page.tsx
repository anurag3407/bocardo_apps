import { Suspense } from 'react';
import { LoginForm } from '@/features/auth/login-form';

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-sky p-12 text-ink lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG brand mark */}
          <img src="/logo.svg" alt="" width={48} height={48} />
          <span className="text-3xl font-black tracking-tight">bocardo</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-5xl font-black leading-[1.05] tracking-tight">Run the city&apos;s kitchens from one place.</h1>
          <p className="mt-4 text-lg text-ink/70">Live orders, riders, restaurants, payouts and support — the Bocardo operations console.</p>
        </div>
        <div className="flex gap-2" aria-hidden>
          <span className="size-3 rounded-full bg-lime" />
          <span className="size-3 rounded-full bg-sun" />
          <span className="size-3 rounded-full bg-ink" />
        </div>
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-white/25" aria-hidden />
        <div className="pointer-events-none absolute right-24 bottom-40 size-40 rounded-full bg-lime/60" aria-hidden />
        <div className="pointer-events-none absolute right-10 bottom-10 size-24 rounded-full bg-sun/80" aria-hidden />
      </section>
      <section className="flex min-w-0 items-center justify-center p-6">
        <Suspense>
          <Login searchParams={searchParams} />
        </Suspense>
      </section>
    </div>
  );
}

async function Login({ searchParams }: Pick<PageProps<'/login'>, 'searchParams'>) {
  const { error } = await searchParams;
  return <LoginForm notAdmin={error === 'not_admin'} />;
}
