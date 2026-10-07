/**
 * Funnel helpers for /admin/funnel (F-141). Pure.
 */

export const FUNNEL_EVENTS = ["page_view", "sample_view", "free_week_started", "checkout_started", "purchase", "week_completed"] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

export const FUNNEL_LABELS: Record<FunnelEvent, string> = {
  page_view: "Page views",
  sample_view: "Sample views",
  free_week_started: "Free weeks started",
  checkout_started: "Checkouts started",
  purchase: "Purchases",
  week_completed: "Weeks completed",
};

/** Counts below this are shown as "fewer than 5" wherever a single workbook is shown. */
export const SUPPRESS_BELOW = 5;

export function suppressed(n: number): string {
  return n < SUPPRESS_BELOW ? `Fewer than ${SUPPRESS_BELOW}` : n.toLocaleString("en-GB");
}

export const RANGES = { "7": 7, "30": 30, "90": 90, "395": 395 } as const;
export type RangeKey = keyof typeof RANGES;

export function parseRange(raw: string | string[] | undefined): RangeKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && v in RANGES ? (v as RangeKey) : "30";
}

/** The inclusive UTC day range for the last N days, as yyyy-mm-dd. */
export function dayRange(days: number, now: Date = new Date()): { from: string; to: string } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export interface SummaryRow {
  event: string;
  workbook_id: string | null;
  workbook_code: string | null;
  n: number;
}

export interface FunnelTable {
  totals: Record<FunnelEvent, number>;
  byWorkbook: { code: string; counts: Record<FunnelEvent, number> }[];
}

const zero = (): Record<FunnelEvent, number> =>
  Object.fromEntries(FUNNEL_EVENTS.map((e) => [e, 0])) as Record<FunnelEvent, number>;

/** Totals across everything, and one row per workbook code. */
export function summarise(rows: readonly SummaryRow[]): FunnelTable {
  const totals = zero();
  const by = new Map<string, Record<FunnelEvent, number>>();
  for (const r of rows) {
    if (!(FUNNEL_EVENTS as readonly string[]).includes(r.event)) continue;
    const e = r.event as FunnelEvent;
    const n = Number(r.n) || 0;
    totals[e] += n;
    if (r.workbook_code) {
      const c = by.get(r.workbook_code) ?? zero();
      c[e] += n;
      by.set(r.workbook_code, c);
    }
  }
  const byWorkbook = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, counts]) => ({ code, counts }));
  return { totals, byWorkbook };
}
