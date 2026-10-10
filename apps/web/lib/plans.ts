import { MARKETS } from "@/lib/markets";
import { monthlyEquivalentMinor } from "@/lib/price-display";
import { PRICE_TO_BE_CONFIRMED, amountFor, formatPrice, pricePointFromRow } from "@/lib/pricing";

/**
 * Plans and pricing pages (F-009, F-206). Pure helpers so the "no price
 * that is not decided" rule is unit tested.
 *
 * Only the membership may show a figure, and only from public.price_points
 * (the interim figures from migration 0010 until Crent sets the real ones).
 * Single workbooks, publisher plans, white-label plans and organisation
 * plans have no decided prices, so every one of them says "talk to us" or
 * "price to be confirmed". Nothing here invents a figure.
 */

export interface PricePointRowLike {
  id: string;
  kind: string;
  amounts: unknown;
  stripe_price_id: string | null;
  active: boolean;
}

export interface MembershipDisplay {
  monthly: string;
  yearly: string;
  /** True when at least one figure came from the database. */
  hasPrice: boolean;
}

/**
 * The membership lines for the pricing page, in GBP because the interim
 * prices are set for the GBP market only. A missing, inactive or
 * placeholder row shows "Price to be confirmed".
 */
export function membershipDisplay(rows: readonly PricePointRowLike[] | null | undefined): MembershipDisplay {
  const gb = MARKETS.GB;
  const line = (id: "member_month" | "member_year", per: string): string | null => {
    const row = (rows ?? []).find((r) => r.id === id);
    const point = row ? pricePointFromRow(row) : null;
    if (!point || !point.active || point.kind !== "membership") return null;
    const minor = amountFor(point, gb);
    return minor === null ? null : `${formatPrice(minor, gb)} ${per}`;
  };
  const monthly = line("member_month", "a month");
  // 14.21: the annual plan as a monthly equivalent with the yearly total beside it, at the same size.
  const yearlyRow = (rows ?? []).find((r) => r.id === "member_year");
  const yearlyPoint = yearlyRow ? pricePointFromRow(yearlyRow) : null;
  const yearlyMinor = yearlyPoint && yearlyPoint.active && yearlyPoint.kind === "membership" ? amountFor(yearlyPoint, gb) : null;
  const yearly = yearlyMinor === null ? null : `${formatPrice(monthlyEquivalentMinor(yearlyMinor), gb)} a month, ${formatPrice(yearlyMinor, gb)} a year`;
  return { monthly: monthly ?? PRICE_TO_BE_CONFIRMED, yearly: yearly ?? PRICE_TO_BE_CONFIRMED, hasPrice: monthly !== null || yearly !== null };
}

/**
 * The line for the two-person membership (0041), in GBP like the others.
 * A missing, inactive or placeholder row gives null: the pricing page leaves
 * the plan out rather than say "to be confirmed" about something it cannot sell yet.
 */
export function sharedPlanDisplay(rows: readonly PricePointRowLike[] | null | undefined): string | null {
  const row = (rows ?? []).find((r) => r.id === "member_two_month");
  const point = row ? pricePointFromRow(row) : null;
  if (!point || !point.active || point.kind !== "membership") return null;
  const minor = amountFor(point, MARKETS.GB);
  return minor === null ? null : `${formatPrice(minor, MARKETS.GB)} a month for two people`;
}

/** Where every "talk to us" button goes: the enquiry form on /publish. */
export const ENQUIRY_HREF = "/publish#enquiry";

/**
 * The privacy line for organisations, from docs/research/akana-business.md
 * section 2.6, adjusted to what exists today: answers are sealed now;
 * organisation counts arrive with the console (F-204), so the page says
 * "will see" rather than "can see".
 */
export function organisationPrivacyLine(brandName: string): string {
  return `Your organisation will see how many people have started and finished, never who wrote what. Answers are sealed. No one at your organisation, your group leader, the author or ${brandName} staff can read them.`;
}
