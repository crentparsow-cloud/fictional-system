import type { MetadataRoute } from "next";
import type { LibraryCard } from "@/lib/catalogue-types";
import { bookClubEligible, bookClubPath } from "@/lib/book-club";
import { authorIndex, isSlug, themeIndex, type Publisher, type ThemeInput } from "@/lib/author-theme-pages";
import { hiddenThemeIds, maskHiddenThemes } from "@/lib/theme-visibility";
import { siteOrigin } from "@/lib/site-url";

/**
 * Sitemap and robots rules (F-011). Pure, so what is listed and what is
 * kept out is unit tested.
 *
 * Listed: the public marketing, plans, help, trust and legal pages, Themes
 * with live workbooks, shelves and collections that readers can see, live
 * non-demo workbooks and their book club pages, authors and imprints that
 * are not demo, and the public-domain evidence pages.
 * Never listed: demo workbooks, demo authors and demo imprints (their pages
 * are noindex), and anything behind sign-in or for staff.
 *
 * The reader pages read the locale from the browser and serve both English
 * variants from one URL, so each entry carries en-GB, en-US and x-default
 * alternates pointing at the same address.
 */

export const STATIC_PUBLIC_PATHS = [
  "/",
  "/publish",
  "/pricing",
  "/white-label",
  "/organisations",
  "/trust",
  "/accessibility",
  "/help",
  "/explore",
  "/themes",
  "/authors",
  "/publishers",
  "/request-title",
  "/how-to-write",
  "/book-clubs",
  "/newsletter",
  "/tell-your-minister",
] as const;

/** Paths crawlers are asked not to visit: signed-in, staff, API and one-time link routes. */
export const PRIVATE_PATH_PREFIXES = [
  "/home",
  "/today",
  "/toolkit",
  "/my-workbooks",
  "/you",
  "/read/",
  "/consent",
  "/terms",
  "/welcome",
  "/sign-in",
  "/sign-out",
  "/auth/",
  "/api/",
  "/admin",
  "/respond/",
  "/dev/",
  "/newsletter/confirm",
  "/newsletter/unsubscribe",
] as const;

export interface SitemapInput {
  origin: string;
  cards: readonly LibraryCard[];
  themes: readonly ThemeInput[];
  publishers: readonly Publisher[];
  publicDomainCodes: readonly string[];
  helpTopics: readonly string[];
  legalDocs: readonly string[];
  /** Shelves with a public page (2.11): the ids Explore shows as tiles. */
  shelfIds?: readonly string[];
  /** Live collections inside their seasonal window with enough titles to show (2.3, 12.5). */
  collectionSlugs?: readonly string[];
}

const LOCALES = ["en-GB", "en-US"] as const;

export function alternatesFor(url: string): { languages: Record<string, string> } {
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[l] = url;
  languages["x-default"] = url;
  return { languages };
}

export function isPrivatePath(path: string): boolean {
  return PRIVATE_PATH_PREFIXES.some((p) => {
    const base = p.replace(/\/$/, "");
    return path === base || path.startsWith(`${base}/`);
  });
}

export function sitemapPaths(input: Omit<SitemapInput, "origin">): string[] {
  const out = new Set<string>(STATIC_PUBLIC_PATHS);
  for (const t of input.helpTopics) if (isSlug(t)) out.add(`/help/${t}`);
  for (const d of input.legalDocs) if (isSlug(d)) out.add(`/legal/${d}`);
  for (const code of input.publicDomainCodes) if (/^AK-[0-9A-Z]{5}$/.test(code)) out.add(`/public-domain/${code}`);

  const live = input.cards.filter((c) => !c.isDemo && isSlug(c.slug));
  for (const c of live) out.add(`/w/${c.slug}`);

  // 6.10 and 14.16: the book club page of every programme that suits a group.
  for (const c of live) if (bookClubEligible(c)) out.add(bookClubPath(c.slug));

  // 2.11: public shelf and collection pages.
  for (const id of input.shelfIds ?? []) if (isSlug(id)) out.add(`/shelves/${id}`);
  for (const slug of input.collectionSlugs ?? []) if (isSlug(slug)) out.add(`/collections/${slug}`);

  for (const a of authorIndex(input.cards)) if (!a.isDemo && isSlug(a.slug)) out.add(`/authors/${a.slug}`);

  const liveCodes = new Set(input.cards.map((c) => c.code));
  for (const p of input.publishers) {
    if (p.isDemo || !isSlug(p.slug)) continue;
    if (p.codes.some((code) => liveCodes.has(code))) out.add(`/publishers/${p.slug}`);
  }

  // Only Themes a reader may see: never a retired one (0025), nor one held
  // below its minimum (F-148), whose page is a 404.
  const shownCards = maskHiddenThemes(input.cards, hiddenThemeIds(input.themes, input.cards));
  for (const shelf of themeIndex(input.themes, shownCards)) {
    for (const t of shelf.themes) if (isSlug(t.id)) out.add(`/themes/${t.id}`);
  }

  return [...out].filter((p) => !isPrivatePath(p));
}

export function buildSitemap(input: SitemapInput): MetadataRoute.Sitemap {
  return sitemapPaths(input).map((path) => {
    const url = `${input.origin}${path}`;
    return { url, alternates: alternatesFor(url) };
  });
}

export function buildRobots(origin: string): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...PRIVATE_PATH_PREFIXES] }],
    sitemap: `${origin}/sitemap.xml`,
  };
}

/**
 * The origin for this request's sitemap and robots file. The marketplace
 * uses the configured origin (lib/site-url.ts). A white-label site uses its
 * own host, which the proxy has already matched to a known tenant; any
 * other host is a 404 before it gets here.
 */
export function siteOriginForRequest(
  tenantKind: string | null | undefined,
  host: string | null | undefined,
  env?: Record<string, string | undefined>,
): string {
  if (tenantKind === "white_label" && host && /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return `https://${host.toLowerCase()}`;
  return siteOrigin(env);
}
