import "server-only";
import { listLibrary } from "@/lib/catalogue";
import { marketFor } from "@/lib/markets";
import { hasLiveMembership, membershipPlansOpen, type SubscriptionRow } from "@/lib/membership";
import { offerPlans, type OfferPlan, type LibraryPeek } from "@/lib/membership-offer";
import { trialEligible } from "@/lib/membership-trial";
import { loadTrialConfig } from "@/lib/membership-trial-server";
import { PRICE_LADDER, marketPriceFor, pricePointFromRow, type PricePoint, type PricePointId } from "@/lib/pricing";
import { createUserClient } from "@/lib/supabase/server";
import { tenantIdForRequest } from "@/lib/tenant-id";

export interface MembershipOfferProps {
  plans: OfferPlan[];
  /** Every membership title that could be shown. The browser picks the ones the quiz suggested first. */
  library: LibraryPeek[];
}

/**
 * What the onboarding offer needs for this reader, or null when there is no
 * offer to make: they already hold a live membership, no plan can be bought
 * yet, or any read fails. Best effort and quiet, because it sits on Home and
 * must never break it. The trial shown is only the trial this reader would
 * actually get at checkout (lib/membership-trial.ts trialEligible).
 */
export async function loadMembershipOffer(userId: string): Promise<MembershipOfferProps | null> {
  try {
    const tenantId = await tenantIdForRequest();
    if (!tenantId) return null;
    const supabase = await createUserClient();
    const { data: subs, error } = await supabase.from("subscriptions").select("status, plan, current_period_end, cancel_at_period_end, ended_at, stripe_customer_id, updated_at").eq("user_id", userId).eq("tenant_id", tenantId);
    if (error) return null;
    const rows = (subs ?? []) as SubscriptionRow[];
    if (hasLiveMembership(rows)) return null;

    const open = membershipPlansOpen();
    if (!open.monthly && !open.yearly) return null;

    const [{ data: profile }, { data: points }, trialConfig, cards] = await Promise.all([
      supabase.from("profiles").select("country").eq("user_id", userId).maybeSingle(),
      supabase.from("price_points").select("id, kind, amounts, stripe_price_id, active").in("id", ["member_month", "member_year"]),
      trialEligible(rows.length) ? loadTrialConfig() : Promise.resolve(null),
      listLibrary({}),
    ]);
    const market = marketFor((profile?.country as string | null | undefined) ?? null);
    const ladder: Partial<Record<PricePointId, PricePoint>> = { ...PRICE_LADDER };
    for (const row of (points ?? []) as { id: string; kind: string; amounts: unknown; stripe_price_id: string | null; active: boolean }[]) {
      const point = pricePointFromRow(row);
      if (point) ladder[point.id] = point.active ? point : { ...point, amounts: {} };
    }
    const plans = offerPlans({
      monthly: marketPriceFor({ pricePointId: "member_month" }, market, ladder),
      yearly: marketPriceFor({ pricePointId: "member_year" }, market, ladder),
      monthlyOpen: open.monthly,
      yearlyOpen: open.yearly,
      trial: trialConfig,
      market,
    });
    if (!plans.length) return null;
    const library = cards
      .filter((c) => c.hasVersion && !c.isDemo && c.inMembership !== false)
      .slice(0, 40)
      .map((c) => ({ slug: c.slug, title: c.title, themeName: c.themeName }));
    return { plans, library };
  } catch {
    return null;
  }
}
