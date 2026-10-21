import type { Market } from "@/lib/markets";
import { trialLabel, type TrialConfig, type TrialPlan } from "@/lib/membership-trial";
import { monthlyPlanLine, yearlyPlanLine, type PlanPriceLine } from "@/lib/price-display";
import type { Price } from "@/lib/pricing";

/**
 * The membership offer (13.4) as plain data, built on the server and handed
 * to the browser. One shape for every plan, so the offer screen, the toggle
 * and the tests read the same fields. Prices come from the same place the
 * checkout charges from (marketPriceFor), so the screen shows what is taken.
 */

export interface OfferPlan {
  plan: TrialPlan;
  heading: string;
  /** The renewal price on its own: "£7.99" or "£69.99". */
  renewal: string;
  line: PlanPriceLine;
  /** Trial length in days for this reader; 0 means none. */
  trialDays: number;
  /** "14 days, then £7.99 a month". Just the price when there is no trial. */
  label: string;
}

export interface LibraryPeek {
  slug: string;
  title: string;
  themeName: string | null;
}

export interface OfferData {
  plans: OfferPlan[];
  library: LibraryPeek[];
}

export function offerPlans(input: {
  monthly: Price | null;
  yearly: Price | null;
  monthlyOpen: boolean;
  yearlyOpen: boolean;
  /** The trial lengths, or null when this reader is not eligible for a trial. */
  trial: TrialConfig | null;
  market: Market;
}): OfferPlan[] {
  const out: OfferPlan[] = [];
  if (input.monthly && input.monthlyOpen) {
    const days = input.trial?.monthly ?? 0;
    out.push({
      plan: "monthly",
      heading: "Monthly",
      renewal: input.monthly.formatted,
      line: monthlyPlanLine(input.monthly, input.market),
      trialDays: days,
      label: trialLabel("monthly", days, input.monthly.formatted),
    });
  }
  if (input.yearly && input.yearlyOpen) {
    const days = input.trial?.yearly ?? 0;
    out.push({
      plan: "yearly",
      heading: "Annual",
      renewal: input.yearly.formatted,
      line: yearlyPlanLine(input.yearly, input.market),
      trialDays: days,
      label: trialLabel("yearly", days, input.yearly.formatted),
    });
  }
  return out;
}

/**
 * Up to `max` titles to show beside the offer: the ones the quiz suggested
 * first, where the membership covers them, then others. Demo titles are not
 * in the membership and never shown.
 */
export function libraryPeek(cards: readonly { slug: string; title: string; themeName: string | null; inMembership?: boolean; isDemo: boolean; hasVersion: boolean }[], suggested: readonly string[], max = 4): LibraryPeek[] {
  const covered = cards.filter((c) => c.hasVersion && !c.isDemo && c.inMembership !== false);
  const rank = (slug: string) => {
    const i = suggested.indexOf(slug);
    return i === -1 ? suggested.length : i;
  };
  return [...covered]
    .sort((a, b) => rank(a.slug) - rank(b.slug) || a.title.localeCompare(b.title))
    .slice(0, max)
    .map((c) => ({ slug: c.slug, title: c.title, themeName: c.themeName }));
}
