import "server-only";
import type { RailSignals } from "@/lib/rails";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { MARKETPLACE_TENANT_ID, tenantIdForRequest } from "@/lib/tenant-id";

/**
 * Reads for the personalised rails (2.9) and author follows (2.10), over the
 * user client so row level security decides. A failed read returns nothing
 * and the page falls back to the ordinary rails.
 */

/**
 * Starts, finishes and returns per live workbook (public.rail_signals, 0056).
 * Counts only. Read on the server with the service role (0068): the exact
 * counts, wellbeing titles included, never reach a browser; the rails turn
 * them into an order.
 */
export async function loadRailSignals(): Promise<RailSignals> {
  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    // No service key in this environment: the ordinary rails stand in.
    return new Map();
  }
  const tenantId = (await tenantIdForRequest()) ?? MARKETPLACE_TENANT_ID;
  const { data, error } = await supabase.rpc("rail_signals", { p_tenant: tenantId });
  if (error) {
    console.error("rail_signals_failed", error.code ?? "");
    return new Map();
  }
  const out = new Map<string, { starts: number; finishes: number; returned: number }>();
  for (const r of (data ?? []) as { workbook_id: string; starts: number | string; finishes: number | string; returned: number | string }[]) {
    out.set(r.workbook_id, { starts: Number(r.starts) || 0, finishes: Number(r.finishes) || 0, returned: Number(r.returned) || 0 });
  }
  return out;
}

/** The slugs of the authors this reader follows. RLS limits the rows to their own. */
export async function loadFollowedAuthorSlugs(userId: string): Promise<Set<string>> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("author_follows").select("authors(slug)").eq("user_id", userId).limit(200);
  if (error) {
    console.error("author_follows_failed", error.code ?? "");
    return new Set();
  }
  const slugs = new Set<string>();
  for (const r of (data ?? []) as unknown as { authors: { slug: string } | null }[]) if (r.authors?.slug) slugs.add(r.authors.slug);
  return slugs;
}

/** Whether this reader follows the author with this slug. */
export async function isFollowingAuthor(userId: string, slug: string): Promise<boolean> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("author_follows").select("author_id, authors!inner(slug)").eq("user_id", userId).eq("authors.slug", slug).limit(1);
  if (error) {
    console.error("author_follow_state_failed", error.code ?? "");
    return false;
  }
  return (data ?? []).length > 0;
}
