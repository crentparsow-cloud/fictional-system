import { formatMoney, type Market } from "@/lib/markets";

/**
 * The price ladder (F-093, F-094) as typed config, mirroring
 * public.price_points in migration 0004. One source for every displayed
 * and charged price: pages show what checkout charges.
 *
 * WORKBOOK PRICES (set 9 October 2026): a six-step GBP ladder, VAT
 * inclusive, from GBP 7.99 to GBP 14.99. The same figures sit in
 * public.price_points on staging and production, each backed by a Stripe
 * price on the product "Akana workbook" (ids in the database rows, not
 * here). Full programmes sit on p4 to p6, first-unit and listing-only
 * titles on p1 to p4. These are the prices until Crent changes them; when
 * they change, update this ladder, the database rows and the Stripe prices
 * together.
 *
 * INTERIM: the two membership points carry test-mode prices for the GBP
 * market until Crent confirms them: GBP 7.99 a month and GBP 69.99 a year,
 * VAT inclusive, no free trial (migration 0010). Their Stripe prices come
 * from STRIPE_PRICE_MEMBERSHIP_MONTHLY and _YEARLY, not from this file, so
 * stripePriceId stays null here and in price_points.
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

/** An empty amounts object, used when a point has no figure. */
export const PLACEHOLDER_AMOUNTS: Amounts = Object.freeze({}) as Amounts;

/**
 * The workbook ladder in minor units, GBP only, VAT inclusive. Mirrors
 * public.price_points. Change both together.
 */
export const WORKBOOK_AMOUNTS: Readonly<Record<WorkbookPricePointId, Amounts>> = Object.freeze({
  p1: Object.freeze({ GBP: 799 }) as Amounts,
  p2: Object.freeze({ GBP: 899 }) as Amounts,
  p3: Object.freeze({ GBP: 999 }) as Amounts,
  p4: Object.freeze({ GBP: 1199 }) as Amounts,
  p5: Object.freeze({ GBP: 1299 }) as Amounts,
  p6: Object.freeze({ GBP: 1499 }) as Amounts,
});

const placeholder = (id: PricePointId, kind: PricePointKind, label: string): PricePoint => ({
  id,
  kind,
  label,
  amounts: PLACEHOLDER_AMOUNTS,
  stripePriceId: null,
  active: false,
});

const workbookPoint = (id: WorkbookPricePointId, label: string): PricePoint => ({
  ...placeholder(id, "workbook", label),
  amounts: WORKBOOK_AMOUNTS[id],
  active: true,
});

/**
 * INTERIM membership prices in minor units, GBP market only, VAT inclusive.
 * Mirrors public.price_points after migration 0010. Change both together.
 */
export const INTERIM_MEMBERSHIP_AMOUNTS: Readonly<Record<MembershipPricePointId, Amounts>> = Object.freeze({
  member_month: Object.freeze({ GBP: 799 }) as Amounts,
  member_year: Object.freeze({ GBP: 6999 }) as Amounts,
});

/** The ladder. p1 is the shortest workbook, p6 the longest. */
export const PRICE_LADDER: Readonly<Record<PricePointId, PricePoint>> = {
  p1: workbookPoint("p1", "Ladder point 1, GBP 7.99 (shortest)"),
  p2: workbookPoint("p2", "Ladder point 2, GBP 8.99"),
  p3: workbookPoint("p3", "Ladder point 3, GBP 9.99"),
  p4: workbookPoint("p4", "Ladder point 4, GBP 11.99"),
  p5: workbookPoint("p5", "Ladder point 5, GBP 12.99"),
  p6: workbookPoint("p6", "Ladder point 6, GBP 14.99 (longest)"),
  member_month: { ...placeholder("member_month", "membership", "Membership, monthly"), amounts: INTERIM_MEMBERSHIP_AMOUNTS.member_month, active: true },
  member_year: { ...placeholder("member_year", "membership", "Membership, annual"), amounts: INTERIM_MEMBERSHIP_AMOUNTS.member_year, active: true },
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
  /**
   * True when the market's own currency has no figure and the price is shown
   * (and charged) in GBP instead (F-094). Pages then show GBP_PRICE_NOTE.
   */
  inGbp?: boolean;
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

// ---------------------------------------------------------------------------
// Local currency display (F-094)
// ---------------------------------------------------------------------------

/**
 * The currency Akana charges in when the market's own currency has no
 * figure. GBP is the only charged currency for now; a market currency is
 * used only where public.price_points holds a figure for it.
 */
export const FALLBACK_CHARGE_CURRENCY: PriceCurrency = "GBP";

/** Shown under a price that is in GBP for a reader whose market uses another currency. */
export const GBP_PRICE_NOTE = "Prices are in pounds sterling (GBP). Your card provider may convert the amount.";

/** Money in a given currency, formatted in the market's locale ("£7.99" in en-US too). */
export function formatPriceIn(minor: number, currency: PriceCurrency, market: Market): string {
  return new Intl.NumberFormat(market.dateLocale, { style: "currency", currency }).format(minor / 100);
}

/**
 * The price a reader in a market is shown, and charged (F-094):
 *
 *   1. the figure in the market's own currency, where price_points has one;
 *   2. otherwise the GBP figure, formatted in the reader's locale and marked
 *      inGbp so the page says the price is in pounds sterling;
 *   3. otherwise null, and the page shows "Price to be confirmed".
 *
 * Nothing is ever converted. The checkout routes use this same function so
 * the price shown is the price charged. Demo titles never carry a price.
 */
export function marketPriceFor(
  workbook: { pricePointId: string | null | undefined; isDemo?: boolean },
  market: Market,
  ladder: Readonly<Partial<Record<PricePointId, PricePoint>>> = PRICE_LADDER,
): Price | null {
  const local = priceFor(workbook, market, ladder);
  if (local) return local;
  if (workbook.isDemo || !isPricePointId(workbook.pricePointId)) return null;
  const point = ladder[workbook.pricePointId];
  if (!point || isPlaceholder(point)) return null;
  const gbp = point.amounts[FALLBACK_CHARGE_CURRENCY];
  if (!isValidMinor(gbp)) return null;
  return {
    pointId: point.id,
    currency: FALLBACK_CHARGE_CURRENCY,
    amountMinor: gbp,
    formatted: formatPriceIn(gbp, FALLBACK_CHARGE_CURRENCY, market),
    inGbp: true,
  };
}
