import "server-only";
import { paywallState, type PaywallState } from "@/components/reader/paywall";
import type { PaidLines } from "@/components/catalogue/PublicBuy";
import { marketFor, type Market } from "@/lib/markets";
import { membershipPlansOpen } from "@/lib/membership";
import { PRICE_LADDER, marketPriceFor, pricePointFromRow, type Price, type PricePoint, type PricePointId } from "@/lib/pricing";
import { paidLine, type PromoOffer } from "@/lib/promo-code";
import { createUserClient } from "@/lib/supabase/server";

/**
 * What the public pages offer for a title (items 3.2 and 5.9): the same
 * figures the reader's paywall and the checkout routes use. The database
 * row wins over the config ladder, as at checkout, and the market comes from
 * the reader's profile country, or the fallback market for a visitor
 * (F-094). One price_points read per page.
 */

export interface OfferWorkbook {
  pricePointId: string | null;
  isDemo: boolean;
  inMembership: boolean;
}

export interface PublicOffer {
  state: Exclude<PaywallState, { kind: "open" }>;
  market: Market;
  prices: { workbook: Price | null; monthly: Price | null; yearly: Price | null };
}

const MEMBERSHIP_POINT: PricePointId = "member_month";
const MEMBERSHIP_YEARLY_POINT: PricePointId = "member_year";

interface PricePointRow {
  id: string;
  kind: string;
  amounts: unknown;
  stripe_price_id: string | null;
  active: boolean;
}

/** The market for a signed-in reader (their profile country) or a visitor (the fallback). */
export async function marketForReader(userId: string | null): Promise<Market> {
  if (!userId) return marketFor(null);
  const supabase = await createUserClient();
  const { data } = await supabase.from("profiles").select("country").eq("user_id", userId).maybeSingle();
  return marketFor((data?.country as string | null | undefined) ?? null);
}

export async function publicOffer(workbook: OfferWorkbook, market: Market): Promise<PublicOffer> {
  const supabase = await createUserClient();
  const ids = [MEMBERSHIP_POINT, MEMBERSHIP_YEARLY_POINT, ...(workbook.pricePointId ? [workbook.pricePointId] : [])];
  const { data: points } = await supabase.from("price_points").select("id, kind, amounts, stripe_price_id, active").in("id", ids);
  const ladder: Partial<Record<PricePointId, PricePoint>> = { ...PRICE_LADDER };
  for (const row of (points ?? []) as PricePointRow[]) {
    const point = pricePointFromRow(row);
    if (point) ladder[point.id] = point.active ? point : { ...point, amounts: {} };
  }
  const prices = {
    workbook: workbook.isDemo ? null : marketPriceFor({ pricePointId: workbook.pricePointId, isDemo: workbook.isDemo }, market, ladder),
    monthly: marketPriceFor({ pricePointId: MEMBERSHIP_POINT }, market, ladder),
    yearly: marketPriceFor({ pricePointId: MEMBERSHIP_YEARLY_POINT }, market, ladder),
  };
  const plansOpen = membershipPlansOpen();
  const state = paywallState({
    entitled: false,
    demo: workbook.isDemo,
    workbookPrice: prices.workbook,
    membershipPrice: prices.monthly,
    membershipCheckoutReady: plansOpen.monthly,
    membershipYearlyPrice: prices.yearly,
    membershipYearlyReady: plansOpen.yearly,
    inMembership: workbook.inMembership,
  });
  if (state.kind === "open") throw new Error("publicOffer: unreachable");
  return { state, market, prices };
}

/** The price paid with a code, one sentence per thing on offer (item 5.9). */
export function paidLinesFor(offer: PublicOffer, promo: PromoOffer): PaidLines {
  const { prices, market } = offer;
  return {
    workbook: prices.workbook ? paidLine(prices.workbook, promo, { kind: "workbook" }, market) : null,
    monthly: prices.monthly ? paidLine(prices.monthly, promo, { kind: "membership", plan: "monthly" }, market) : null,
    yearly: prices.yearly ? paidLine(prices.yearly, promo, { kind: "membership", plan: "yearly" }, market) : null,
  };
}
