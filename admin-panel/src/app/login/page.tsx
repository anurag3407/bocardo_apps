import { Suspense } from 'react';
import { LoginForm } from '@/features/auth/login-form';

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <Login searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Login({ searchParams }: Pick<PageProps<'/login'>, 'searchParams'>) {
  const { error } = await searchParams;
  return <LoginForm notAdmin={error === 'not_admin'} />;
}
