import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { hasRouteAccess, getDefaultRouteForRole } from '@/lib/constants/permissions';

const PUBLIC_PATHS = ['/login', '/setup', '/change-password'];

/**
 * Edge proxy (Next.js 16 convention; formerly "middleware"):
 *   1. Refreshes the Supabase auth cookies on every request (session survival).
 *   2. First-run gate: everything redirects to /setup until the company exists.
 *   3. Authentication gate: unauthenticated users → /login.
 *   4. Activation + temp-password gates.
 *   5. Role/route gate driven by lib/constants/permissions.js.
 *
 * This is defense-in-depth: RLS and the per-action server guards remain the
 * real enforcement; the proxy just keeps users on coherent routes.
 */
export async function proxy(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { pathname } = request.nextUrl;

  // 1. First-run setup gate (app_initialized is a SECURITY DEFINER rpc that
  //    anon callers may execute — see 00002_rls_policies.sql).
  const { data: initialized } = await supabase.rpc('app_initialized');
  if (initialized === false && pathname !== '/setup') {
    return redirect(request, '/setup');
  }
  if (initialized === true && pathname === '/setup') {
    return redirect(request, '/login');
  }

  // 2. Refresh the session; establish identity.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (PUBLIC_PATHS.includes(pathname)) return response;
    return redirect(request, `/login?next=${encodeURIComponent(pathname)}`);
  }

  if (pathname === '/login') {
    return redirect(request, '/dashboard');
  }

  // 3. Read the caller's profile (RLS: own row is always readable).
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active, must_change_password')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.is_active) {
    // Deactivated accounts are bounced; their cookies will fail on the next
    // API call as well because RLS hides every row.
    await supabase.auth.signOut();
    return redirect(request, '/login?error=inactive');
  }

  if (profile.must_change_password && pathname !== '/change-password') {
    return redirect(request, '/change-password');
  }

  // 4. Role-based route guard (server-side mirror of the sidebar).
  if (!PUBLIC_PATHS.includes(pathname) && !hasRouteAccess(pathname, profile.role)) {
    return redirect(request, getDefaultRouteForRole(profile.role));
  }

  return response;
}

function redirect(request, destination) {
  return NextResponse.redirect(new URL(destination, request.url));
}

export const config = {
  matcher: [
    // Run on everything except static assets and Next internals.
    '/((?!_next/static|_next/image|favicon.ico|icons/|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
