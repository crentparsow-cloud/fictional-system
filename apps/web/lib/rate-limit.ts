/**
 * A small fixed-window counter held in memory. It saves a database round
 * trip when one address hammers a form, nothing more: each server instance
 * keeps its own counts and loses them on restart. The rule that holds is the
 * one in the database (app.submit_lead allows 5 leads per ip_hash per hour).
 */
export type RateLimiter = {
  /** Counts one attempt for the key. False when the key is over the limit. */
  hit(key: string): boolean;
  reset(): void;
};

export function createRateLimiter(o: { limit: number; windowMs: number; now?: () => number; maxKeys?: number }): RateLimiter {
  const now = o.now ?? Date.now;
  const maxKeys = o.maxKeys ?? 10_000;
  const buckets = new Map<string, { start: number; count: number }>();

  return {
    hit(key) {
      const t = now();
      const b = buckets.get(key);
      if (!b || t - b.start >= o.windowMs) {
        if (buckets.size >= maxKeys) {
          // Drop expired buckets first; if none expired, drop the oldest.
          for (const [k, v] of buckets) if (t - v.start >= o.windowMs) buckets.delete(k);
          if (buckets.size >= maxKeys) {
            const first = buckets.keys().next().value;
            if (first !== undefined) buckets.delete(first);
          }
        }
        buckets.set(key, { start: t, count: 1 });
        return true;
      }
      b.count += 1;
      return b.count <= o.limit;
    },
    reset() {
      buckets.clear();
    },
  };
}
