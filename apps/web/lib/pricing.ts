import { formatMoney, type Market } from "@/lib/markets";

/**
 * The price ladder (F-093, F-094) as typed config, mirroring
 * public.price_points in migration 0004. One source for every displayed
 * and charged price: pages show what checkout charges.
 *
 * PLACEHOLDER: every amount below is empty because Crent has not set the
 * figures (questions C4 and D1 to D4 are open). While a point has no
 * amount, priceFor() returns null and pages show "Price to be confirmed".
 * Nothing can be sold from a placeholder point: the checkout route refuses.
 *
 * When the figures arrive they go in two places at once: here, and in
 * public.price_points (plus the Stripe price ids). The database row wins at
 * checkout time; this file is for display and tests.
 */

export type WorkbookPricePointId = "p1" | "p2" | "p3" | "p4" | "p5" | "p6";
export type MembershipPricePointId = "member_month" | "member_year";
export type PricePointId = WorkbookPricePointId | MembershipPricePointId;
export type PricePointKind = "workbook" | "membership";

/** The six fixed currencies. GBP leads; the others are set per point, never converted. */
export type PriceCurrency = "GBP" | "EUR" | "USD" | "AUD" | "CAD" | "NZD";
export const PRICE_CURRENCIES: readonly PriceCurrency[] = ["GBP", "EUR", "USD", "AUD", "CAD", "NZD"];

/** Minor units per currency. A missing key means no price in that currency. */
export type Amounts = Partial<Record<PriceCurrency, number>>;

export interface PricePoint {
  id: PricePointId;
  kind: PricePointKind;
  /** Plain words for the ladder page and the author portal. */
  label: string;
  amounts: Amounts;
  stripePriceId: string | null;
  active: boolean;
}

/** PLACEHOLDER. Empty on purpose until Crent sets the figures. */
export const PLACEHOLDER_AMOUNTS: Amounts = Object.freeze({}) as Amounts;

const placeholder = (id: PricePointId, kind: PricePointKind, label: string): PricePoint => ({
  id,
  kind,
  label,
  amounts: PLACEHOLDER_AMOUNTS,
  stripePriceId: null,
  active: false,
});

/** The ladder. p1 is the shortest workbook, p6 the longest. */
export const PRICE_LADDER: Readonly<Record<PricePointId, PricePoint>> = {
  p1: placeholder("p1", "workbook", "Ladder point 1 (shortest)"),
  p2: placeholder("p2", "workbook", "Ladder point 2"),
  p3: placeholder("p3", "workbook", "Ladder point 3"),
  p4: placeholder("p4", "workbook", "Ladder point 4"),
  p5: placeholder("p5", "workbook", "Ladder point 5"),
  p6: placeholder("p6", "workbook", "Ladder point 6 (longest)"),
  member_month: placeholder("member_month", "membership", "Membership, monthly"),
  member_year: placeholder("member_year", "membership", "Membership, annual"),
};

export const PRICE_POINT_IDS = Object.keys(PRICE_LADDER) as PricePointId[];

export function isPricePointId(value: unknown): value is PricePointId {
  return typeof value === "string" && (PRICE_POINT_IDS as string[]).includes(value);
}

/** True while the point has no usable amount for any currency. */
export function isPlaceholder(point: Pick<PricePoint, "amounts"> | null | undefined): boolean {
  if (!point) return true;
  return !PRICE_CURRENCIES.some((c) => isValidMinor(point.amounts[c]));
}

function isValidMinor(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

/** The ISO code the ladder uses for a market's currency ("gbp" -> "GBP"). */
export function priceCurrencyFor(market: Market): PriceCurrency {
  return market.currency.toUpperCase() as PriceCurrency;
}

/**
 * A price_points row from the database as a PricePoint. Unknown ids and
 * malformed amounts are dropped rather than trusted; the result is treated
 * as a placeholder when nothing valid remains.
 */
export function pricePointFromRow(row: { id: string; kind: string; amounts: unknown; stripe_price_id: string | null; active: boolean }): PricePoint | null {
  if (!isPricePointId(row.id)) return null;
  if (row.kind !== "workbook" && row.kind !== "membership") return null;
  const amounts: Amounts = {};
  if (row.amounts && typeof row.amounts === "object" && !Array.isArray(row.amounts)) {
    for (const c of PRICE_CURRENCIES) {
      const v = (row.amounts as Record<string, unknown>)[c];
      if (isValidMinor(v)) amounts[c] = v;
    }
  }
  return { ...PRICE_LADDER[row.id], kind: row.kind, amounts, stripePriceId: row.stripe_price_id, active: row.active };
}

export interface Price {
  pointId: PricePointId;
  currency: PriceCurrency;
  amountMinor: number;
  /** "£12.00", in the market's locale. Tax-inclusive where that is the rule. */
  formatted: string;
}

/** Money in the market's currency and locale. Thin wrapper so pages import one module. */
export function formatPrice(minor: number, market: Market): string {
  return formatMoney(minor, market);
}

/**
 * The amount for a point in a market, or null when the point is a
 * placeholder or has no amount in that currency. Falls back to nothing, not
 * to GBP: a reader abroad is never shown a currency they did not ask for
 * (F-094). Adaptive Pricing for other currencies is a Stripe-side matter.
 */
export function amountFor(point: PricePoint | null | undefined, market: Market): number | null {
  if (!point || isPlaceholder(point)) return null;
  const v = point.amounts[priceCurrencyFor(market)];
  return isValidMinor(v) ? v : null;
}

/**
 * The display price for a workbook in a market, or null so the page can
 * show "Price to be confirmed". Demo titles never carry a price (F-114).
 * Pass the database row through pricePointFromRow() to use live figures;
 * the default ladder is the config mirror.
 */
export function priceFor(
  workbook: { pricePointId: string | null | undefined; isDemo?: boolean },
  market: Market,
  ladder: Readonly<Partial<Record<PricePointId, PricePoint>>> = PRICE_LADDER,
): Price | null {
  if (workbook.isDemo) return null;
  if (!isPricePointId(workbook.pricePointId)) return null;
  const point = ladder[workbook.pricePointId];
  if (!point) return null;
  const amountMinor = amountFor(point, market);
  if (amountMinor === null) return null;
  const currency = priceCurrencyFor(market);
  return { pointId: point.id, currency, amountMinor, formatted: formatPrice(amountMinor, market) };
}

/** What a page shows when priceFor() is null. */
export const PRICE_TO_BE_CONFIRMED = "Price to be confirmed";
