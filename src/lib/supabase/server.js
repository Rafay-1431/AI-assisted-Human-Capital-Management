import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase server client bound to the request's auth cookies.
 *
 * This is the DEFAULT client for server components and server actions:
 * queries run as the signed-in user, so RLS is the enforcement layer.
 * Actions must layer explicit role checks on top (services/guard.js) because
 * RLS alone cannot express every business rule.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component render — safe to ignore,
            // proxy.js already refreshes sessions on every request.
          }
        },
      },
    },
  );
}
