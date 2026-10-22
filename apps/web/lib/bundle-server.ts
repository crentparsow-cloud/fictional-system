import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUNDLE_CURRENCY, bundleAmount, bundleOffer, type BundleOffer } from "@/lib/bundle";
import { isPlaceholder, pricePointFromRow } from "@/lib/pricing";

/**
 * What the Theme page and the bundle checkout both read, so the page shows
 * what the checkout charges. A title is in the bundle when it is live, not a
 * demo, has a published version and has a GBP price. The bundle price comes
 * from public.theme_bundles, set by staff; with none set there is no offer.
 * Runs as the reader, so row level security decides what is visible.
 */
export async function loadBundleOffer(supabase: SupabaseClient, themeId: string, tenantId: string, userId: string | null): Promise<BundleOffer | null> {
  const [{ data: bundle }, { data: wbs }] = await Promise.all([
    supabase.from("theme_bundles").select("amounts, active").eq("theme_id", themeId).eq("active", true).maybeSingle(),
    supabase
      .from("workbooks")
      .select("id, price_point_id, is_demo, current_version_id")
      .eq("tenant_id", tenantId)
      .eq("theme_id", themeId)
      .eq("status", "live")
      .limit(100),
  ]);
  const bundleMinor = bundleAmount((bundle as { amounts?: unknown } | null)?.amounts);
  if (!bundleMinor) return null;
  const live = ((wbs ?? []) as { id: string; price_point_id: string | null; is_demo: boolean; current_version_id: string | null }[]).filter((w) => !w.is_demo && w.current_version_id);
  if (live.length < 2) return null;
  const ids = [...new Set(live.map((w) => w.price_point_id).filter((x): x is string => Boolean(x)))];
  const { data: points } = ids.length ? await supabase.from("price_points").select("id, kind, amounts, stripe_price_id, active").in("id", ids) : { data: [] };
  const priceById = new Map<string, number>();
  for (const row of (points ?? []) as { id: string; kind: string; amounts: unknown; stripe_price_id: string | null; active: boolean }[]) {
    const p = pricePointFromRow(row);
    const v = p && p.active && !isPlaceholder(p) ? p.amounts[BUNDLE_CURRENCY] : undefined;
    if (typeof v === "number" && v > 0) priceById.set(row.id, v);
  }
  const titles = live.map((w) => ({ id: w.id, priceMinor: (w.price_point_id && priceById.get(w.price_point_id)) || 0 }));

  let owned: string[] = [];
  if (userId) {
    const { data: ent } = await supabase
      .from("entitlements")
      .select("workbook_id, ends_at")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .in("workbook_id", titles.map((t) => t.id));
    owned = ((ent ?? []) as { workbook_id: string | null; ends_at: string | null }[])
      .filter((e) => e.workbook_id && (!e.ends_at || Date.parse(e.ends_at) > Date.now()))
      .map((e) => e.workbook_id as string);
  }
  return bundleOffer({ titles, bundleMinor, ownedIds: owned });
}
