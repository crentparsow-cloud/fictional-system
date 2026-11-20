import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * A client with the publishable key and no session at all. It reads what
 * anyone may read: the catalogue, a tenant's site and listings, the free
 * sections of a public workbook.
 *
 * The tenant site uses it for everything public (F-133). A reader signed in
 * on a tenant host holds a tenant_reader token, which is granted a handful
 * of the reader's own tables and nothing else (migration 0073), so public
 * reads must not travel with it.
 */
export function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
