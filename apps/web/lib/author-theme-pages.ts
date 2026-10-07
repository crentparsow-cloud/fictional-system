import type { LibraryCard } from "@/lib/catalogue-types";
// Demo catalogue, read for the invented imprints (F-006). Organisations are not
// readable by visitors, so publisher pages come from this file until a public
// view of organisations exists.
import demoCatalogue from "../../../docs/planning/AK_Demo_Catalogue.json";

/**
 * Pure helpers for the author, publisher and Theme pages (F-006, F-007). The
 * pages read live cards once through lib/catalogue.ts and narrow them here,
 * so the narrowing is unit tested and the pages stay server rendered.
 */

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** True for a URL slug the database would accept: lower case words joined by single hyphens. */
export function isSlug(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length <= 120 && SLUG.test(value);
}

const byTitle = (a: LibraryCard, b: LibraryCard) => a.title.localeCompare(b.title);

/** Cards crediting the author with this slug, sorted by title. */
export function cardsByAuthor(cards: readonly LibraryCard[], slug: string): LibraryCard[] {
  return cards.filter((c) => (c.authorRefs ?? []).some((a) => a.slug === slug)).sort(byTitle);
}

/** Cards on the Theme with this id, sorted by title. */
export function cardsByTheme(cards: readonly LibraryCard[], themeId: string): LibraryCard[] {
  return cards.filter((c) => c.themeId === themeId).sort(byTitle);
}

/** Cards whose AK- code is in the set, sorted by title. */
export function cardsByCodes(cards: readonly LibraryCard[], codes: ReadonlySet<string>): LibraryCard[] {
  return cards.filter((c) => codes.has(c.code)).sort(byTitle);
}

export interface AuthorSummary {
  slug: string;
  name: string;
  count: number;
  /** True when every workbook credited to the author is a demo title. */
  isDemo: boolean;
}

/** Every author credited on the cards, with a workbook count, sorted by name. */
export function authorIndex(cards: readonly LibraryCard[]): AuthorSummary[] {
  const out = new Map<string, AuthorSummary>();
  for (const c of cards) {
    for (const a of c.authorRefs ?? []) {
      const cur = out.get(a.slug);
      if (cur) {
        cur.count += 1;
        cur.isDemo = cur.isDemo && c.isDemo;
      } else {
        out.set(a.slug, { slug: a.slug, name: a.name, count: 1, isDemo: c.isDemo });
      }
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface ThemeInput {
  id: string;
  name: string;
  line: string | null;
  shelfId: string | null;
  shelfName: string | null;
  /** themes.hidden_until_min_books (0015, F-148). See lib/theme-visibility.ts. */
  held?: boolean;
  /** themes.min_books. */
  minBooks?: number | null;
  /** shelves.hidden_until_min_books for the Theme's shelf. */
  shelfHeld?: boolean;
}

export interface ThemeSummary extends ThemeInput {
  count: number;
}

export interface ThemeShelf {
  shelfId: string | null;
  shelfName: string | null;
  themes: ThemeSummary[];
}

/**
 * Themes that hold at least one of the cards, with counts, grouped by shelf.
 * Shelves and Themes sort by name; Themes with no shelf come last.
 */
export function themeIndex(themes: readonly ThemeInput[], cards: readonly LibraryCard[]): ThemeShelf[] {
  const counts = new Map<string, number>();
  for (const c of cards) if (c.themeId) counts.set(c.themeId, (counts.get(c.themeId) ?? 0) + 1);
  const shelves = new Map<string, ThemeShelf>();
  for (const t of themes) {
    const count = counts.get(t.id) ?? 0;
    if (count === 0) continue;
    const key = t.shelfId ?? "";
    let shelf = shelves.get(key);
    if (!shelf) {
      shelf = { shelfId: t.shelfId, shelfName: t.shelfName, themes: [] };
      shelves.set(key, shelf);
    }
    shelf.themes.push({ ...t, count });
  }
  const out = [...shelves.values()].sort((a, b) => {
    if (a.shelfId === null) return 1;
    if (b.shelfId === null) return -1;
    return (a.shelfName ?? "").localeCompare(b.shelfName ?? "");
  });
  for (const s of out) s.themes.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** "1 workbook" or "{n} workbooks". */
export function workbookCount(n: number): string {
  return n === 1 ? "1 workbook" : `${n} workbooks`;
}

// ---------- publishers (F-006) ----------

export interface Publisher {
  slug: string;
  code: string;
  name: string;
  city: string | null;
  country: string | null;
  note: string | null;
  isDemo: boolean;
  /** AK- codes of the workbooks this imprint publishes. */
  codes: string[];
}

interface CatalogueShape {
  publishers: { id: string; slug: string; name: string; city?: string; country?: string; note?: string; is_demo?: boolean }[];
  workbooks: { code: string; publisher_id: string | null }[];
}

/** Builds the publisher list from a catalogue shaped like AK_Demo_Catalogue.json. Exported for tests. */
export function publishersFrom(catalogue: CatalogueShape): Publisher[] {
  return catalogue.publishers
    .filter((p) => isSlug(p.slug))
    .map((p) => ({
      slug: p.slug,
      code: p.id,
      name: p.name,
      city: p.city ?? null,
      country: p.country ?? null,
      note: p.note ?? null,
      isDemo: p.is_demo !== false,
      codes: catalogue.workbooks.filter((w) => w.publisher_id === p.id).map((w) => w.code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

let cached: Publisher[] | null = null;

/** The imprints in the demo catalogue, sorted by name. */
export function listPublishers(): Publisher[] {
  if (!cached) cached = publishersFrom(demoCatalogue as unknown as CatalogueShape);
  return cached;
}

/** One imprint by slug, or null. */
export function findPublisher(slug: string, publishers: readonly Publisher[] = listPublishers()): Publisher | null {
  if (!isSlug(slug)) return null;
  return publishers.find((p) => p.slug === slug) ?? null;
}

/** The imprint that publishes this AK- code, or null when the title is independent or a classic. */
export function publisherForCode(code: string, publishers: readonly Publisher[] = listPublishers()): Publisher | null {
  return publishers.find((p) => p.codes.includes(code)) ?? null;
}

/** Only http and https links are shown. Anything else gives null. */
export function safeWebsite(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** A two-letter region code as an English name, or the code when the runtime does not know it. */
export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["en-GB"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
