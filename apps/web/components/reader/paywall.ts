import { SHARED_PLAN_POSITIONING } from "@/lib/shared-membership";
import type { Market } from "@/lib/markets";
import { trialLabel } from "@/lib/membership-trial";
import { yearlyPlanLine } from "@/lib/price-display";
import { GBP_PRICE_NOTE, PRICE_TO_BE_CONFIRMED, type Price } from "@/lib/pricing";

/**
 * What the calm paywall shows (F-019), as data. The card replaces a unit the
 * reader's entitlement does not cover. It never covers the Toolkit tab or
 * Help now, never counts down and never says anything about scarcity.
 *
 *   entitled            nothing: the unit opens
 *   demo                no buttons, one line saying demo titles are not sold
 *   otherwise           what the full workbook includes, that answers carry
 *                       over, and two buttons. A button with no price is
 *                       disabled and says "Price to be confirmed".
 */

export interface PaywallInput {
  /** The reader's entitlement covers this unit. */
  entitled: boolean;
  /** Demo titles are never sold (F-114). */
  demo: boolean;
  /** priceFor() for this workbook, or null while the price is a placeholder. */
  workbookPrice: Price | null;
  /** The membership price, or null while it is a placeholder. */
  membershipPrice: Price | null;
  /**
   * Whether a membership checkout exists. Until F-097 lands there is nowhere
   * to send a reader, so the button stays disabled even with a price.
   */
  membershipCheckoutReady?: boolean;
  /** The annual membership price, or null while it is a placeholder (F-097). */
  membershipYearlyPrice?: Price | null;
  /** Whether the annual plan has a Stripe price configured. */
  membershipYearlyReady?: boolean;
  /** The two-person membership price, or null while it is a placeholder (0041). */
  membershipTwoPrice?: Price | null;
  /** Whether the two-person plan has a Stripe price configured. */
  membershipTwoReady?: boolean;
  /** Whether this workbook is in the membership catalogue (0009). Defaults to true. */
  inMembership?: boolean;
  /**
   * The trial this reader would get at checkout, in days per plan (13.5), or
   * omitted when they are not eligible. Labels read "14 days, then £7.99 a
   * month", never "free" (5.3).
   */
  membershipTrial?: { monthly: number; yearly: number };
  /**
   * The reader's market. With it, the annual line shows the monthly
   * equivalent and the yearly total at the same size (14.21).
   */
  market?: Market;
}

export interface PaywallButton {
  enabled: boolean;
  label: "Buy this workbook" | "Join the membership";
  /** Shown inside the button under the label: the price, or why it is disabled. */
  note: string;
}

/** The quiet second way to join, under the membership button. Shown only when it can be used. */
export interface PaywallYearly {
  label: string;
}

/** The quiet third way to join: one membership shared by two people (0041). Shown only when it can be used. */
export interface PaywallShared {
  positioning: string;
  label: string;
}

export type PaywallState =
  | { kind: "open" }
  | { kind: "demo"; message: string }
  | { kind: "offer"; buy: PaywallButton; membership: PaywallButton; yearly?: PaywallYearly; shared?: PaywallShared; currencyNote?: string; trialDays?: number };

export const DEMO_NOT_FOR_SALE = "This is a demo title. Demo titles cannot be bought.";
export const MEMBERSHIP_NOT_OPEN = "Membership is not open yet";
export const NOT_IN_MEMBERSHIP = "Not included in the membership";

export function paywallState(input: PaywallInput): PaywallState {
  if (input.entitled) return { kind: "open" };
  if (input.demo) return { kind: "demo", message: DEMO_NOT_FOR_SALE };

  const buy: PaywallButton = input.workbookPrice
    ? { enabled: true, label: "Buy this workbook", note: input.workbookPrice.formatted }
    : { enabled: false, label: "Buy this workbook", note: PRICE_TO_BE_CONFIRMED };

  const included = input.inMembership !== false;
  let membership: PaywallButton;
  if (!included) membership = { enabled: false, label: "Join the membership", note: NOT_IN_MEMBERSHIP };
  else if (!input.membershipPrice) membership = { enabled: false, label: "Join the membership", note: PRICE_TO_BE_CONFIRMED };
  else if (!input.membershipCheckoutReady) membership = { enabled: false, label: "Join the membership", note: MEMBERSHIP_NOT_OPEN };
  else {
    const days = input.membershipTrial?.monthly ?? 0;
    membership = { enabled: true, label: "Join the membership", note: trialLabel("monthly", days, input.membershipPrice.formatted) };
  }

  const yearlyShown = included && !!input.membershipYearlyPrice && !!input.membershipYearlyReady;
  // F-094: a price shown in GBP to a reader whose market uses another currency says so.
  const sharedShown = included && !!input.membershipTwoPrice && !!input.membershipTwoReady;
  const inGbp =
    !!input.workbookPrice?.inGbp ||
    (membership.enabled && !!input.membershipPrice?.inGbp) ||
    (yearlyShown && !!input.membershipYearlyPrice?.inGbp) ||
    (sharedShown && !!input.membershipTwoPrice?.inGbp);
  const trialDays = membership.enabled ? (input.membershipTrial?.monthly ?? 0) : 0;
  const extra = {
    ...(sharedShown && input.membershipTwoPrice
      ? { shared: { positioning: SHARED_PLAN_POSITIONING, label: `Share a membership, ${input.membershipTwoPrice.formatted} a month for two people` } }
      : {}),
    ...(inGbp ? { currencyNote: GBP_PRICE_NOTE } : {}),
    ...(trialDays > 0 ? { trialDays } : {}),
  };

  if (yearlyShown && input.membershipYearlyPrice) {
    return { kind: "offer", buy, membership, yearly: { label: yearlyLabel(input.membershipYearlyPrice, input.market, input.membershipTrial?.yearly ?? 0) }, ...extra };
  }
  return { kind: "offer", buy, membership, ...extra };
}

/**
 * The annual line under the monthly button. With a market it is the monthly
 * equivalent and the yearly total side by side, and the trial first when
 * there is one: "21 days, then £5.83 a month, £69.99 a year". Without one it
 * is the older "Or pay £69.99 a year".
 */
function yearlyLabel(price: Price, market: Market | undefined, trialDays: number): string {
  if (!market) return `Or pay ${price.formatted} a year`;
  const line = yearlyPlanLine(price, market);
  const prices = `${line.primary}, ${line.secondary}`;
  return trialDays > 0 ? `Or ${trialDays} days, then ${prices}` : `Or ${prices}`;
}

/** "8 weeks", "1 module": the unit count from the listing in plain words. */
export function unitCountPhrase(count: number, unit: "week" | "day" | "module" | "chapter"): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}
