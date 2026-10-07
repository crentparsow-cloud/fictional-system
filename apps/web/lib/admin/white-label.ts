import { knownRoles, type PlatformRole } from "@/lib/staff-access";
import { isDemoLook, type BrandLink, type DemoLook, type TenantBrand } from "@/lib/tenant-brand";

/**
 * Admin helpers for white-label tenants and the demo (F-045, F-067, F-069,
 * F-074). Pure, so the pages, actions and tests share one answer. The role
 * sets mirror migration 0023 and 0001:
 *
 *   tenant name and brand   0001 tenants_update + 0023 guard: platform owner, editor
 *   tenant listings         0002 can_edit_tenant_listings: platform owner, editor
 *   demo reset              0023 public.reset_demo_state: owner, editor
 *   demo logins             0023 add_demo_account / remove_demo_account: owner
 */
export interface WhiteLabelAbilities {
  readTenants: boolean;
  editTenants: boolean;
  resetDemo: boolean;
  manageDemoLogins: boolean;
}

const EDIT: readonly PlatformRole[] = ["owner", "editor"];

export function whiteLabelAbilities(raw: readonly unknown[] | null | undefined): WhiteLabelAbilities {
  const roles = knownRoles(raw);
  const has = (wanted: readonly PlatformRole[]) => roles.some((r) => wanted.includes(r));
  return {
    readTenants: roles.length > 0,
    editTenants: has(EDIT),
    resetDemo: has(EDIT),
    manageDemoLogins: roles.includes("owner"),
  };
}

type Get = (key: string) => FormDataEntryValue | null;

function text(get: Get, key: string): string {
  const v = get(key);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Links typed one per line as "Label | https://address". Blank lines are
 * skipped. A line without the bar keeps the whole line as the address, so
 * validation reports it rather than dropping it silently.
 */
export function parseLinksText(raw: string): BrandLink[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((line) => {
      const bar = line.indexOf("|");
      if (bar === -1) return { label: "", href: line };
      return { label: line.slice(0, bar).trim(), href: line.slice(bar + 1).trim() };
    });
}

export function linksToText(links: readonly BrandLink[] | undefined): string {
  return (links ?? []).map((l) => `${l.label} | ${l.href}`).join("\n");
}

/**
 * The brand form as a raw brand object for validateBrand(). Empty optional
 * fields are left out, so the tenant keeps the house default for them.
 * Colours come from <input type="color">, which always sends #rrggbb; they
 * are lower-cased here because the database stores lower case only.
 */
export function parseBrandForm(get: Get): { name: string; brand: Record<string, unknown> } {
  const brand: Record<string, unknown> = { v: 1 };
  const lp = text(get, "light_primary").toLowerCase();
  const la = text(get, "light_accent").toLowerCase();
  const dp = text(get, "dark_primary").toLowerCase();
  const da = text(get, "dark_accent").toLowerCase();
  if (lp || la || dp || da) brand.colours = { light: { primary: lp, accent: la }, dark: { primary: dp, accent: da } };
  const font = text(get, "font");
  if (font) brand.font = font;
  const logoSrc = text(get, "logo_src");
  if (logoSrc) brand.logo = { src: logoSrc, alt: text(get, "logo_alt") };
  const favicon = text(get, "favicon");
  if (favicon) brand.favicon = favicon;
  const footer = parseLinksText(text(get, "footer_links"));
  if (footer.length) brand.footer_links = footer;
  const legal = parseLinksText(text(get, "legal_links"));
  if (legal.length) brand.legal_links = legal;
  const sender = text(get, "sender_name");
  if (sender) brand.sender_name = sender;
  return { name: text(get, "name"), brand };
}

/** Hex colours from the contrast check's query string, or null when any is missing or malformed. */
export function checkedColours(params: Record<string, string | string[] | undefined>): TenantBrand["colours"] | null {
  const one = (k: string) => {
    const v = params[k];
    const s = (Array.isArray(v) ? v[0] : v) ?? "";
    return /^#?[0-9a-fA-F]{6}$/.test(s) ? `#${s.replace("#", "").toLowerCase()}` : null;
  };
  const lp = one("lp"), la = one("la"), dp = one("dp"), da = one("da");
  if (!lp || !la || !dp || !da) return null;
  return { light: { primary: lp, accent: la }, dark: { primary: dp, accent: da } };
}

export interface ListingInput {
  visible: boolean;
  featured: boolean;
  sort: number;
  pricePointId: string | null;
}

const WORKBOOK_POINTS = ["p1", "p2", "p3", "p4", "p5", "p6"] as const;
export const LISTING_PRICE_OPTIONS = WORKBOOK_POINTS;

export function parseListingForm(get: Get): ListingInput | null {
  const sortRaw = text(get, "sort") || "0";
  if (!/^-?[0-9]{1,4}$/.test(sortRaw)) return null;
  const price = text(get, "price_point_id");
  if (price && !(WORKBOOK_POINTS as readonly string[]).includes(price)) return null;
  return {
    visible: get("visible") === "on",
    featured: get("featured") === "on",
    sort: Number(sortRaw),
    pricePointId: price || null,
  };
}

export function parseAkCode(raw: FormDataEntryValue | null): string | null {
  const s = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return /^AK-[0-9A-HJKMNP-TV-Z]{5}$/.test(s) ? s : null;
}

export function parseDemoLook(raw: FormDataEntryValue | null): DemoLook | null {
  return isDemoLook(raw) ? raw : null;
}

/** A fixed notice code for a database refusal; never the database's text. */
export function whiteLabelErrorNotice(code: string | undefined): string {
  switch (code) {
    case "AKW01":
      return "brand_invalid";
    case "AKW02":
    case "42501":
      return "denied";
    case "AKW03":
      return "listing_refused";
    case "AKW04":
      return "listing_price";
    case "AKW05":
      return "demo_login_refused";
    case "23505":
      return "listing_exists";
    default:
      return "failed";
  }
}
