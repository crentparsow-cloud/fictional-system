import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { createUserClient } from "@/lib/supabase/server";
import { flagOn, type FlagRow } from "@/lib/platform/flags";

/**
 * Flag reads on the server (10.5). A flag that cannot be read is off, so a
 * database error never switches a feature on. The signed-in reader's own
 * answer comes from public.flag_on (migration 0064), which uses their id.
 * Jobs that act for many readers read the row once and bucket each reader
 * with flagOn, so the answer is the same as the database's.
 */

/** Is this flag on for the signed-in reader? One read per flag per request. */
export const flagEnabled = cache(async function flagEnabled(key: string): Promise<boolean> {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.rpc("flag_on", { p_key: key });
    return !error && data === true;
  } catch {
    return false;
  }
});

interface Row {
  enabled: boolean;
  rollout_percent: number;
}

/** The global row for a flag, or null when it cannot be read. */
export async function readFlagRow(client: SupabaseClient, key: string): Promise<FlagRow | null> {
  const { data, error } = await client
    .from("feature_flags")
    .select("enabled, rollout_percent")
    .eq("key", key)
    .eq("scope", "global")
    .eq("scope_id", "")
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Row;
  return { enabled: row.enabled === true, rolloutPercent: Number(row.rollout_percent) };
}

/** A job's helper: is the flag on for this reader, from a row read once. */
export function flagOnFor(row: FlagRow | null, key: string, userId: string): boolean {
  return flagOn(row, key, userId);
}
