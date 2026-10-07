import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayoutStore, PendingPayout } from "@/lib/money/payout-run";

/**
 * The money functions of migration 0021 over a Supabase client. The same
 * code serves the cron routes (service role client) and the staff console
 * (the staff member's own client): the SQL functions check the caller.
 * Errors carry the Postgres code only.
 */
type Db = SupabaseClient;

function fail(what: string, error: { code?: string; message?: string }): never {
  throw new Error(`${what} failed: ${error.code ?? "unknown"}`);
}

export function payoutStore(db: Db): PayoutStore {
  return {
    async startRun(livemode, trigger) {
      const { data, error } = await db.rpc("start_payout_run", { p_livemode: livemode, p_trigger: trigger });
      if (error) fail("start_payout_run", error);
      return data as string;
    },
    async pending(livemode, onlyId) {
      let q = db.from("payouts").select("id, org_id, currency, amount_minor, stripe_destination").eq("status", "pending").eq("livemode", livemode);
      if (onlyId) q = q.eq("id", onlyId);
      const { data, error } = await q.order("created_at", { ascending: true }).limit(500);
      if (error) fail("payouts read", error);
      return ((data ?? []) as PendingPayout[]).map((p) => ({ ...p, amount_minor: Number(p.amount_minor) }));
    },
    async complete(payoutId, transferId) {
      const { error } = await db.rpc("complete_payout", { p_payout: payoutId, p_transfer: transferId });
      if (error) fail("complete_payout", error);
    },
    async fail(payoutId, code) {
      const { error } = await db.rpc("fail_payout", { p_payout: payoutId, p_code: code });
      if (error) fail("fail_payout", error);
    },
    async finish(runId, outcome) {
      const { error } = await db.rpc("finish_payout_run", { p_run: runId, p_outcome: outcome });
      if (error) fail("finish_payout_run", error);
    },
  };
}

export interface RoyaltyConfig {
  id: number;
  effective_from: string;
  is_placeholder: boolean;
  sale_rate_author: number;
  sale_rate_author_link: number;
  pool_share_author: number;
  pool_step_cap: number;
  pool_activity_floor: number;
  fee_treatment: "deduct" | "akana_carries";
  refund_window_days: number;
  first_payout_hold_days: number;
  min_payout_minor: Record<string, number>;
  approval_above_minor: Record<string, number>;
  payout_day: number;
  note: string | null;
}

export const CONFIG_COLUMNS =
  "id, effective_from, is_placeholder, sale_rate_author, sale_rate_author_link, pool_share_author, pool_step_cap, pool_activity_floor, fee_treatment, refund_window_days, first_payout_hold_days, min_payout_minor, approval_above_minor, payout_day, note";

/** The config row in force now. */
export async function currentConfig(db: Db): Promise<RoyaltyConfig | null> {
  const { data, error } = await db
    .from("royalty_config")
    .select(CONFIG_COLUMNS)
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("royalty_config read", error);
  return (data as RoyaltyConfig | null) ?? null;
}
