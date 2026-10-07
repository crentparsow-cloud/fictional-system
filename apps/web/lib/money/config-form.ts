import { parseMajorToMinor } from "@/lib/money/format";

/**
 * The royalty figures form (owner staff only, migration 0021
 * public.set_royalty_config). Rates are typed as percentages; money as
 * major units per currency. Pure, so it can be tested.
 */
export const CONFIG_CURRENCIES = ["GBP", "USD", "EUR"] as const;

export interface ConfigInput {
  p_sale_rate_author: number;
  p_sale_rate_author_link: number;
  p_pool_share_author: number;
  p_pool_step_cap: number;
  p_pool_activity_floor: number;
  p_fee_treatment: "deduct" | "akana_carries";
  p_refund_window_days: number;
  p_first_payout_hold_days: number;
  p_min_payout_minor: Record<string, number>;
  p_approval_above_minor: Record<string, number>;
  p_payout_day: number;
  p_note: string;
}

function pct(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^\d{1,3}(\.\d{1,2})?$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  if (n < 0 || n > 100) return null;
  return Math.round(n * 100) / 10000;
}

function int(raw: unknown, min: number, max: number): number | null {
  if (typeof raw !== "string" || !/^\d{1,4}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= min && n <= max ? n : null;
}

export function parseConfigForm(get: (name: string) => unknown): ConfigInput | null {
  const sale = pct(get("sale_rate"));
  const saleLink = pct(get("sale_rate_link"));
  const pool = pct(get("pool_share"));
  const cap = int(get("step_cap"), 1, 1000);
  const floor = int(get("activity_floor"), 0, 1000);
  const fee = get("fee_treatment");
  const window = int(get("refund_window_days"), 0, 120);
  const hold = int(get("first_payout_hold_days"), 0, 365);
  const day = int(get("payout_day"), 1, 28);
  const note = typeof get("note") === "string" ? String(get("note")).trim() : "";
  if (sale === null || saleLink === null || pool === null || cap === null || floor === null || window === null || hold === null || day === null) return null;
  if (fee !== "deduct" && fee !== "akana_carries") return null;
  if (note.length < 3 || note.length > 500) return null;
  const min: Record<string, number> = {};
  const approve: Record<string, number> = {};
  for (const c of CONFIG_CURRENCIES) {
    const m = get(`min_${c}`);
    const a = get(`approve_${c}`);
    if (typeof m === "string" && m.trim()) {
      const v = parseMajorToMinor(m);
      if (v === null) return null;
      min[c] = v;
    }
    if (typeof a === "string" && a.trim()) {
      const v = parseMajorToMinor(a);
      if (v === null) return null;
      approve[c] = v;
    }
  }
  return {
    p_sale_rate_author: sale,
    p_sale_rate_author_link: saleLink,
    p_pool_share_author: pool,
    p_pool_step_cap: cap,
    p_pool_activity_floor: floor,
    p_fee_treatment: fee,
    p_refund_window_days: window,
    p_first_payout_hold_days: hold,
    p_min_payout_minor: min,
    p_approval_above_minor: approve,
    p_payout_day: day,
    p_note: note,
  };
}

/** 0.5 -> "50" for a form default. */
export function pctValue(rate: number | string | null | undefined): string {
  const n = Number(rate);
  return Number.isFinite(n) ? String(Math.round(n * 10000) / 100) : "";
}
