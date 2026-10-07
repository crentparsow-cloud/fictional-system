import { brand } from "@/lib/brand";
import { MARKETS } from "@/lib/markets";
import { PRICE_TO_BE_CONFIRMED, priceFor } from "@/lib/pricing";

/**
 * Locked standards on tenant sites (F-068). This copy is Akana's, set in
 * code, and drawn by components/tenant/TenantShell on every tenant page. No
 * tenant setting can change, hide or restyle it: the brand shape in
 * lib/tenant-brand.ts has no key for it, and the shell renders it with
 * Akana's own safety tokens (--help-bg, --help-ink), which a brand never
 * sets.
 */

export const TENANT_WELLNESS_NOTICE =
  "The workbooks on this site are for wellness and learning. They are not treatment, therapy or medical advice.";

export const TENANT_SAFETY_LINE =
  "If you are in danger, or might act on thoughts of harming yourself, call your local emergency number now. Help now lists free support lines.";

export const TENANT_PRIVACY_LINE = `This site runs on ${brand.name}. Your answers are encrypted and only you can read them. ${brand.name}'s privacy notice and reader terms apply here.`;

/** Links every tenant footer carries, in this order, whatever the tenant adds. */
export const LOCKED_FOOTER_LINKS = [
  { href: "/help-now", label: "Help now" },
  { href: "/legal/privacy", label: "Privacy notice" },
  { href: "/legal/terms", label: "Reader terms" },
  { href: "/legal/cookies", label: "Cookie statement" },
] as const;

export const DEMO_SITE_NOTICE =
  "This is a demo site. The publisher, its authors and its workbooks are invented, and nothing here is for sale.";

export const POWERED_BY = `Powered by ${brand.name}`;

/**
 * The price line on a tenant card or page (F-069). Prices are config only:
 * a tenant site has no checkout yet, so a real price says so beside it. The
 * tenant's default currency is GBP at launch.
 */
export function tenantPriceLine(card: { isDemo: boolean; pricePointId: string | null }): string {
  if (card.isDemo) return "Demo title. Not for sale.";
  const price = priceFor({ pricePointId: card.pricePointId, isDemo: false }, MARKETS.GB);
  if (!price) return PRICE_TO_BE_CONFIRMED;
  return `${price.formatted}. Not on sale on this site yet.`;
}
