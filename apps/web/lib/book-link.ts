/**
 * The book link behind /go/<slug> (F-017). Pure, so it can be tested.
 *
 * Store links come from the workbook's own book block (store_links by
 * market), which was validated as URLs at publish. Only https links are
 * followed. The reader's market wins, then GB, then US, then any market
 * with a link. With no usable link the reader goes back to the workbook
 * page, never to an address built from the request.
 */
const FALLBACK_ORDER = ["GB", "US"] as const;

export function pickBookLink(storeLinks: unknown, market: string | null): string | null {
  if (!storeLinks || typeof storeLinks !== "object" || Array.isArray(storeLinks)) return null;
  const links = storeLinks as Record<string, unknown>;
  const safe = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    try {
      const u = new URL(v);
      return u.protocol === "https:" ? u.toString() : null;
    } catch {
      return null;
    }
  };
  const order = [market ?? "", ...FALLBACK_ORDER, ...Object.keys(links).sort()];
  for (const m of order) {
    if (!m) continue;
    const hit = safe(links[m]);
    if (hit) return hit;
  }
  return null;
}
