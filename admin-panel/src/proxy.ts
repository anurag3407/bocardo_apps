import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAdmin, type AdminClaims } from './core/auth/claims';

/**
 * Optimistic gate: refreshes the Supabase session cookie and keeps non-admins out of the
 * console. The API still authorizes every call — this only avoids rendering a dead UI.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as AdminClaims | undefined;
  const onLogin = request.nextUrl.pathname.startsWith('/login');

  if (!isAdmin(claims) && !onLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    if (claims) url.searchParams.set('error', 'not_admin');
    return NextResponse.redirect(url);
  }
  if (isAdmin(claims) && onLogin) return NextResponse.redirect(new URL('/', request.url));
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
