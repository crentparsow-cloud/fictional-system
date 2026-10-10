import type { Market } from "@/lib/markets";
import { formatPriceIn, type Price } from "@/lib/pricing";

/**
 * How the two membership plans are shown side by side (14.21).
 *
 * The annual plan is shown as a monthly equivalent with the yearly total
 * beside it, both at the same size, so nobody has to do the sum and nothing
 * is tucked away. There is no struck-through price, no "was" figure, no
 * "save" percentage and no countdown: a comparison against twelve monthly
 * payments invites a claim that has to be defended, and the two real prices
 * on screen already let a reader compare.
 *
 * The monthly equivalent is the yearly total over twelve, rounded to the
 * nearest penny. It is a display figure only. What is charged is the yearly
 * price, once a year, and the line says so.
 */

export interface PlanPriceLine {
  plan: "monthly" | "yearly";
  /** The headline figure: "£7.99 a month", or the monthly equivalent for the annual plan. */
  primary: string;
  /** The figure beside it, the same size: "£69.99 a year" for the annual plan, null for monthly. */
  secondary: string | null;
  /** What is charged and when, in a sentence. */
  billing: string;
}

/** The yearly total over twelve, rounded to the nearest minor unit. */
export function monthlyEquivalentMinor(yearlyMinor: number): number {
  return Math.round(yearlyMinor / 12);
}

export function monthlyPlanLine(monthly: Price, market: Market): PlanPriceLine {
  const price = formatPriceIn(monthly.amountMinor, monthly.currency, market);
  return { plan: "monthly", primary: `${price} a month`, secondary: null, billing: `${price} each month until you cancel.` };
}

export function yearlyPlanLine(yearly: Price, market: Market): PlanPriceLine {
  const total = formatPriceIn(yearly.amountMinor, yearly.currency, market);
  const monthly = formatPriceIn(monthlyEquivalentMinor(yearly.amountMinor), yearly.currency, market);
  return {
    plan: "yearly",
    primary: `${monthly} a month`,
    secondary: `${total} a year`,
    billing: `${total} once a year until you cancel. The monthly figure is the yearly price divided by twelve.`,
  };
}
