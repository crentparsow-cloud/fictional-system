import type Stripe from "stripe";
import { formatPriceIn, type Price, type PriceCurrency } from "@/lib/pricing";
import type { Market } from "@/lib/markets";

/**
 * Promotion codes (item 5.9): pure data and words, shared by the /code page,
 * the public workbook page, the two checkout routes and the tests. The
 * Stripe read itself is in lib/promo-code-server.ts.
 *
 * A code is a Stripe promotion code in the account's current mode (test
 * mode until launch). Crent creates them in the Stripe dashboard; nothing
 * here invents a discount. The page shows the total the reader will pay in
 * plain words and the checkout route pins the same promotion code to the
 * Checkout Session, so the price shown is the price paid (DMCC 2024). No
 * page ever shows "was £Y" or a struck-through price.
 */

/** Stripe codes are letters and digits; a reader may also type a dash or underscore. Case does not matter. */
const CODE = /^[A-Z0-9][A-Z0-9_-]{0,39}$/;

/** The code as Stripe stores it, or null when what was typed cannot be a code. */
export function normalisePromoCode(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  return CODE.test(v) ? v : null;
}

export type PromoDuration = "once" | "repeating" | "forever";

export interface PromoOffer {
  /** The promotion code id (promo_...), what Checkout is given. */
  id: string;
  /** The code as the reader types it, upper case. */
  code: string;
  percentOff: number | null;
  /** Fixed amounts are in one currency; a price in another currency cannot use them. */
  amountOffMinor: number | null;
  currency: PriceCurrency | null;
  duration: PromoDuration;
  durationInMonths: number | null;
  /** Stripe only accepts the code from a customer with no previous payment. */
  firstTimeOnly: boolean;
  minimumAmountMinor: number | null;
  minimumCurrency: PriceCurrency | null;
}

const CURRENCIES: readonly string[] = ["GBP", "EUR", "USD", "AUD", "CAD", "NZD"];
const asCurrency = (v: string | null | undefined): PriceCurrency | null => {
  const c = (v ?? "").toUpperCase();
  return CURRENCIES.includes(c) ? (c as PriceCurrency) : null;
};

/**
 * A promotion code from Stripe as an offer, or null when it cannot be used:
 * inactive, expired, fully redeemed, or on a coupon Stripe says is no longer
 * valid. The coupon must carry a percentage or a fixed amount. The caller
 * expands `promotion.coupon`; an unexpanded id is treated as unusable.
 */
export function promoOfferFromStripe(pc: Stripe.PromotionCode, now = Date.now()): PromoOffer | null {
  if (!pc.active) return null;
  if (pc.expires_at && pc.expires_at * 1000 <= now) return null;
  if (typeof pc.max_redemptions === "number" && pc.times_redeemed >= pc.max_redemptions) return null;
  const coupon = pc.promotion?.type === "coupon" ? pc.promotion.coupon : null;
  if (!coupon || typeof coupon !== "object" || !coupon.valid) return null;
  const percentOff = typeof coupon.percent_off === "number" && coupon.percent_off > 0 && coupon.percent_off <= 100 ? coupon.percent_off : null;
  const amountOffMinor = typeof coupon.amount_off === "number" && coupon.amount_off > 0 ? coupon.amount_off : null;
  if (percentOff === null && amountOffMinor === null) return null;
  const duration: PromoDuration = coupon.duration === "repeating" ? "repeating" : coupon.duration === "forever" ? "forever" : "once";
  const min = pc.restrictions?.minimum_amount;
  return {
    id: pc.id,
    code: pc.code.toUpperCase(),
    percentOff,
    amountOffMinor,
    currency: amountOffMinor !== null ? asCurrency(coupon.currency) : null,
    duration,
    durationInMonths: duration === "repeating" && typeof coupon.duration_in_months === "number" ? coupon.duration_in_months : null,
    firstTimeOnly: pc.restrictions?.first_time_transaction === true,
    minimumAmountMinor: typeof min === "number" && min > 0 ? min : null,
    minimumCurrency: typeof min === "number" && min > 0 ? asCurrency(pc.restrictions?.minimum_amount_currency) : null,
  };
}

/**
 * The amount the reader pays for a price once the code is applied, in minor
 * units, or null when the code cannot apply to this price: a fixed amount
 * in another currency, or a price under the code's minimum. Percentages
 * round to the nearest penny, as Stripe does; a fixed amount never takes the
 * total below zero.
 */
export function discountedMinor(price: Pick<Price, "amountMinor" | "currency">, offer: PromoOffer): number | null {
  if (offer.minimumAmountMinor !== null) {
    if (offer.minimumCurrency && offer.minimumCurrency !== price.currency) return null;
    if (price.amountMinor < offer.minimumAmountMinor) return null;
  }
  if (offer.percentOff !== null) {
    const off = Math.round((price.amountMinor * offer.percentOff) / 100);
    return Math.max(0, price.amountMinor - off);
  }
  if (offer.amountOffMinor !== null) {
    if (offer.currency !== price.currency) return null;
    return Math.max(0, price.amountMinor - offer.amountOffMinor);
  }
  return null;
}

/** "AKANA takes 20% off." or "AKANA takes £2.00 off." The coupon in plain words, with nothing about a previous price. */
export function offerSummary(offer: PromoOffer, market: Market): string {
  if (offer.percentOff !== null) {
    const pct = Number.isInteger(offer.percentOff) ? String(offer.percentOff) : offer.percentOff.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    return `${offer.code} takes ${pct}% off.`;
  }
  if (offer.amountOffMinor !== null && offer.currency) return `${offer.code} takes ${formatPriceIn(offer.amountOffMinor, offer.currency, market)} off.`;
  return `${offer.code} is a valid code.`;
}

export type PromoTarget = { kind: "workbook" } | { kind: "membership"; plan: "monthly" | "yearly" };

/**
 * What the reader pays, in one sentence, with the code applied. For a
 * workbook the total is a single figure. For a membership the sentence says
 * how long the code lasts and what the price is after that, because a
 * coupon that lasts once or for a few months changes the first payments
 * only. Returns null when the code cannot apply to this price.
 */
export function paidLine(price: Price, offer: PromoOffer, target: PromoTarget, market: Market): string | null {
  const total = discountedMinor(price, offer);
  if (total === null) return null;
  const pay = formatPriceIn(total, price.currency, market);
  const full = price.formatted;
  if (target.kind === "workbook") return `With code ${offer.code} you pay ${pay} for this workbook.`;
  const period = target.plan === "monthly" ? "month" : "year";
  if (offer.duration === "forever") return `With code ${offer.code} you pay ${pay} a ${period} for as long as you stay a member.`;
  if (offer.duration === "repeating" && offer.durationInMonths && target.plan === "monthly" && offer.durationInMonths > 1) {
    return `With code ${offer.code} you pay ${pay} a month for your first ${offer.durationInMonths} months, then ${full} a month.`;
  }
  return `With code ${offer.code} you pay ${pay} for your first ${period}, then ${full} a ${period}.`;
}

/** Why a code could not be applied, in plain words. One line, no blame. */
export const PROMO_MESSAGES = {
  unknown: "That code is not one we recognise. Check the spelling and try again.",
  unavailable: "Codes cannot be checked just now. You can still buy at the listed price, or try again later.",
  notForThis: "This code does not apply to that price.",
  firstTimeOnly: "This code is for a first payment with us only.",
} as const;
