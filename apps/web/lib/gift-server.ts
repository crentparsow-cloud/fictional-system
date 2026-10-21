import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { giftMessageMaxFrom, giftMonthsFrom, giftOptions, type GiftOption } from "@/lib/gift";
import { PRICE_LADDER, isPlaceholder, pricePointFromRow } from "@/lib/pricing";

/**
 * What the gift page and the gift checkout both read, so the page shows what
 * the checkout charges. Gifts are priced in GBP: the membership price points
 * carry a GBP figure today, and a gift is the monthly and annual prices
 * multiplied out (lib/gift.ts). The database row wins over the config mirror.
 */
export const GIFT_CURRENCY = "GBP";

export interface GiftConfig {
  months: number[];
  messageMax: number;
  options: GiftOption[];
  monthlyMinor: number | null;
  yearlyMinor: number | null;
}

/** The GBP monthly and annual membership prices in minor units: the database row if it is live, else the config mirror. */
export async function loadMembershipMinor(supabase: SupabaseClient): Promise<{ monthlyMinor: number | null; yearlyMinor: number | null }> {
  const { data: points } = await supabase.from("price_points").select("id, kind, amounts, stripe_price_id, active").in("id", ["member_month", "member_year"]);
  const minor = (id: "member_month" | "member_year"): number | null => {
    const row = ((points ?? []) as { id: string; kind: string; amounts: unknown; stripe_price_id: string | null; active: boolean }[]).find((r) => r.id === id);
    const fromRow = row ? pricePointFromRow(row) : null;
    const point = fromRow && !isPlaceholder(fromRow) && fromRow.active ? fromRow : PRICE_LADDER[id];
    const v = point.amounts[GIFT_CURRENCY];
    return typeof v === "number" && v > 0 ? v : null;
  };
  return { monthlyMinor: minor("member_month"), yearlyMinor: minor("member_year") };
}

export async function loadGiftConfig(supabase: SupabaseClient): Promise<GiftConfig> {
  const [{ data: cfg }, { monthlyMinor, yearlyMinor }] = await Promise.all([
    supabase.from("app_config").select("key, value").in("key", ["gift_months", "gift_message_max"]),
    loadMembershipMinor(supabase),
  ]);
  const rows = (cfg ?? []) as { key: string; value: unknown }[];
  const months = giftMonthsFrom(rows);
  const messageMax = giftMessageMaxFrom(rows);
  return { months, messageMax, options: giftOptions(months, monthlyMinor, yearlyMinor, GIFT_CURRENCY), monthlyMinor, yearlyMinor };
}
