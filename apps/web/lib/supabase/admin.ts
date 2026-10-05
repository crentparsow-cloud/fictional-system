import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service role client. Bypasses row level security.
 *
 * Only route handlers that must act without a user session may import this:
 * Stripe webhooks, cron jobs, the sealing write path after its own checks.
 * It is never imported from a page, a Server Component or anything that could
 * reach a client bundle. CI greps for the key name in client output and fails
 * the build if it appears (architecture 3.3).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Service role client is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
