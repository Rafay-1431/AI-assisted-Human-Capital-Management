import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client. BYPASSES ALL RLS.
 *
 * Allowed uses ONLY:
 *   - First-run setup: creating the initial Admin auth user + company row.
 *   - auth.admin operations: creating HR/employee logins, temp passwords,
 *     resetting or banning users (actions these APIs can't do as a user).
 *   - AI infrastructure: rate-limit reads + ai_logs writes (server-side only).
 *
 * Everything else goes through the user-scoped server client so RLS applies.
 */
export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables.',
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
