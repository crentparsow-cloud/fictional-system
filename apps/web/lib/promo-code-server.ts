import "server-only";
import { normalisePromoCode, promoOfferFromStripe, type PromoOffer } from "@/lib/promo-code";
import { createRateLimiter } from "@/lib/rate-limit";
import { getStripe } from "@/lib/stripe";

/**
 * Looks a promotion code up in Stripe (item 5.9). One read, by code, active
 * codes only. Stripe matches the code without regard to case. Used by the
 * /code page to show the price paid and by the checkout routes to pin the
 * same code to the Checkout Session.
 *
 *   unknown      no active code of that name, or one that cannot be used
 *   unavailable  Stripe is not configured or did not answer
 *
 * A small in-memory limiter keeps one address from using the page to guess
 * codes at Stripe's expense: 30 lookups a minute per key, then "unavailable".
 */
export type PromoLookup = { ok: true; offer: PromoOffer } | { ok: false; reason: "unknown" | "unavailable" };

const lookups = createRateLimiter({ limit: 30, windowMs: 60 * 1000 });

export async function lookupPromoCode(raw: string | null | undefined, limiterKey = "all"): Promise<PromoLookup> {
  const code = normalisePromoCode(raw);
  if (!code) return { ok: false, reason: "unknown" };
  if (!lookups.hit(limiterKey)) return { ok: false, reason: "unavailable" };
  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  try {
    const list = await stripe.promotionCodes.list({ code, active: true, limit: 1, expand: ["data.promotion.coupon"] });
    const pc = list.data[0];
    if (!pc) return { ok: false, reason: "unknown" };
    const offer = promoOfferFromStripe(pc);
    return offer ? { ok: true, offer } : { ok: false, reason: "unknown" };
  } catch (err) {
    console.error("promo_code_lookup_failed", { type: err instanceof Error ? err.name : typeof err });
    return { ok: false, reason: "unavailable" };
  }
}
