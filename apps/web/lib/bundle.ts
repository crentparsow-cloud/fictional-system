import type Stripe from "stripe";
import { formatMinor } from "@/lib/membership-email";

/**
 * Theme bundles (5.8), as pure helpers.
 *
 * A bundle is every live, priced title on one Theme, sold together at the
 * price staff set in public.theme_bundles. The page shows the bundle price
 * and the price of buying the same titles one at a time, side by side, in
 * the same size. Nothing is struck through. The bundle is only offered to a
 * reader who owns none of the titles, so the sum is honest, and only when it
 * really costs less than buying them one at a time.
 */

export const BUNDLE_CURRENCY = "GBP";
export const MIN_BUNDLE_TITLES = 2;

export interface BundleTitle {
  id: string;
  priceMinor: number;
}

export interface BundleOffer {
  workbookIds: string[];
  titleCount: number;
  bundleMinor: number;
  singlesMinor: number;
  savingMinor: number;
  bundlePrice: string;
  singlesPrice: string;
  savingPrice: string;
}

/** The amount in the bundle's currency from a theme_bundles.amounts object, or null. */
export function bundleAmount(amounts: unknown, currency = BUNDLE_CURRENCY): number | null {
  if (!amounts || typeof amounts !== "object") return null;
  const v = (amounts as Record<string, unknown>)[currency];
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

/** The offer for a reader, or null when it should not be shown. */
export function bundleOffer(input: { titles: readonly BundleTitle[]; bundleMinor: number | null; ownedIds: readonly string[]; currency?: string }): BundleOffer | null {
  const currency = input.currency ?? BUNDLE_CURRENCY;
  const titles = input.titles.filter((t) => Number.isInteger(t.priceMinor) && t.priceMinor > 0);
  // A title with no price cannot be sold singly, so a Theme with one is not bundled.
  if (titles.length !== input.titles.length || titles.length < MIN_BUNDLE_TITLES) return null;
  if (!input.bundleMinor || input.bundleMinor <= 0) return null;
  const owned = new Set(input.ownedIds);
  if (titles.some((t) => owned.has(t.id))) return null;
  const singlesMinor = titles.reduce((sum, t) => sum + t.priceMinor, 0);
  if (input.bundleMinor >= singlesMinor) return null;
  const savingMinor = singlesMinor - input.bundleMinor;
  const bundlePrice = formatMinor(input.bundleMinor, currency);
  const singlesPrice = formatMinor(singlesMinor, currency);
  const savingPrice = formatMinor(savingMinor, currency);
  if (!bundlePrice || !singlesPrice || !savingPrice) return null;
  return {
    workbookIds: titles.map((t) => t.id),
    titleCount: titles.length,
    bundleMinor: input.bundleMinor,
    singlesMinor,
    savingMinor,
    bundlePrice,
    singlesPrice,
    savingPrice,
  };
}

/** Plain lines for the page. Both figures are shown the same way; neither is crossed out. */
export function bundleLines(o: BundleOffer): { heading: string; bundle: string; singles: string; saving: string } {
  return {
    heading: `All ${o.titleCount} workbooks on this Theme together`,
    bundle: `Together: ${o.bundlePrice}`,
    singles: `One at a time: ${o.singlesPrice}`,
    saving: `Buying them together saves ${o.savingPrice}.`,
  };
}

export interface BundleCheckoutInput {
  themeId: string;
  themeName: string;
  titleCount: number;
  bundleMinor: number;
  currency: string;
  userId: string;
  tenantId: string;
  buyerEmail: string | null;
  consentMeta: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
}

/** Stripe Checkout in payment mode. Stripe sees the Theme name and a count, never a workbook title. */
export function bundleCheckoutParams(i: BundleCheckoutInput): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: i.currency.toLowerCase(),
          unit_amount: i.bundleMinor,
          tax_behavior: "inclusive",
          product_data: { name: "Akana Theme bundle", description: `${i.themeName}: ${i.titleCount} workbooks` },
        },
      },
    ],
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    customer_email: i.buyerEmail ?? undefined,
    client_reference_id: i.userId,
    metadata: { kind: "bundle", user_id: i.userId, tenant_id: i.tenantId, theme_id: i.themeId, titles: String(i.titleCount), ...i.consentMeta },
    payment_intent_data: { metadata: { kind: "bundle", user_id: i.userId, theme_id: i.themeId } },
    success_url: i.successUrl,
    cancel_url: i.cancelUrl,
  };
}
