import { createBrowserClient } from '@supabase/ssr';

let browserClient;

/**
 * Singleton Supabase browser client.
 *
 * Uses the anon key bound to the signed-in user's JWT — every query from this
 * client is evaluated against the RLS policies in supabase/migrations/00002.
 * Never use it for privileged work; that is what server actions + the
 * service-role admin client (lib/supabase/admin.js) are for.
 */
export function getSupabaseBrowserClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }
  return browserClient;
}
