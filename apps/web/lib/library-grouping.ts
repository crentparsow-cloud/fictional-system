import type { EnrolmentStatus, LengthBucket, LibraryCard } from "@/lib/catalogue-types";

/**
 * Groups library cards by genre shelf, then by Theme (F-003). Pure, so the
 * page stays server rendered and the grouping is unit tested. Cards with no
 * Theme sit in one "no theme" group at the end of their shelf.
 */
export interface ThemeGroup {
  themeId: string | null;
  themeName: string | null;
  cards: LibraryCard[];
}

export interface ShelfGroup {
  genreId: string;
  genreName: string;
  count: number;
  themes: ThemeGroup[];
}

export function groupLibrary(cards: readonly LibraryCard[]): ShelfGroup[] {
  const shelves = new Map<string, ShelfGroup>();
  for (const card of cards) {
    let shelf = shelves.get(card.genreId);
    if (!shelf) {
      shelf = { genreId: card.genreId, genreName: card.genreName, count: 0, themes: [] };
      shelves.set(card.genreId, shelf);
    }
    shelf.count += 1;
    const key = card.themeId ?? "";
    let theme = shelf.themes.find((t) => (t.themeId ?? "") === key);
    if (!theme) {
      theme = { themeId: card.themeId, themeName: card.themeName, cards: [] };
      shelf.themes.push(theme);
    }
    theme.cards.push(card);
  }
  const byName = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "");
  const out = [...shelves.values()].sort((a, b) => byName(a.genreName, b.genreName));
  for (const shelf of out) {
    shelf.themes.sort((a, b) => {
      if (a.themeId === null) return 1;
      if (b.themeId === null) return -1;
      return byName(a.themeName, b.themeName);
    });
    for (const theme of shelf.themes) theme.cards.sort((a, b) => byName(a.title, b.title));
  }
  return out;
}

// ---------- filters (F-003) ----------

/**
 * Every Library filter lives in the URL, so the page is server rendered and
 * any combination can be linked to. Values are checked here; anything that
 * does not fit is dropped rather than passed on.
 */
export interface LibraryQuery {
  genre?: string;
  theme?: string;
  author?: string;
  lang?: string;
  length?: LengthBucket;
  /** Enrolled workbooks only. */
  mine?: boolean;
  /** Enrolled and not finished. */
  progress?: boolean;
  q?: string;
}

export type LibraryChange = { [K in keyof LibraryQuery]?: LibraryQuery[K] | null };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const GENRE = /^[a-z_]+$/;
const LANG = /^[a-z]{2}(-[A-Z]{2})?$/;
export const LENGTH_BUCKETS: readonly LengthBucket[] = ["short", "medium", "long"];

type RawParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s.slice(0, 80) : undefined;
}

/** Reads the search params into a checked query. */
export function parseLibraryQuery(sp: RawParams): LibraryQuery {
  const out: LibraryQuery = {};
  const genre = one(sp.genre);
  if (genre && GENRE.test(genre)) out.genre = genre;
  const theme = one(sp.theme);
  if (theme && SLUG.test(theme)) out.theme = theme;
  const author = one(sp.author);
  if (author && SLUG.test(author)) out.author = author;
  const lang = one(sp.lang);
  if (lang && LANG.test(lang)) out.lang = lang;
  const length = one(sp.length);
  if (length && (LENGTH_BUCKETS as readonly string[]).includes(length)) out.length = length as LengthBucket;
  if (one(sp.mine) === "1") out.mine = true;
  if (one(sp.progress) === "1") out.progress = true;
  const q = (one(sp.q) ?? "").trim();
  if (q) out.q = q;
  return out;
}

/** True when any filter narrows the list. */
export function hasActiveFilters(query: LibraryQuery): boolean {
  return Boolean(query.genre || query.theme || query.author || query.lang || query.length || query.mine || query.progress || query.q);
}

/** The href for the current query with one or more parts changed. null clears a part. */
export function libraryHref(base: string, current: LibraryQuery, change: LibraryChange = {}): string {
  const next: LibraryQuery = { ...current };
  for (const key of Object.keys(change) as (keyof LibraryQuery)[]) {
    const v = change[key];
    if (v === null || v === undefined || v === false) delete next[key];
    else (next as Record<string, unknown>)[key] = v;
  }
  const params = new URLSearchParams();
  if (next.genre) params.set("genre", next.genre);
  if (next.theme) params.set("theme", next.theme);
  if (next.author) params.set("author", next.author);
  if (next.lang) params.set("lang", next.lang);
  if (next.length) params.set("length", next.length);
  if (next.mine) params.set("mine", "1");
  if (next.progress) params.set("progress", "1");
  if (next.q) params.set("q", next.q);
  const s = params.toString();
  return s ? `${base}?${s}` : base;
}

/** Filter chips carry their state in the URL. This builds the href for one chip. */
export function chipHref(base: string, current: { genre?: string; theme?: string; q?: string }, change: { genre?: string | null; theme?: string | null }): string {
  return libraryHref(base, current, change);
}

/** Up to 4 units is short, 5 to 8 is medium, 9 or more is long. Unknown stays unknown. */
export function lengthBucket(count: number | null | undefined): LengthBucket | null {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 1) return null;
  if (count <= 4) return "short";
  if (count <= 8) return "medium";
  return "long";
}

export const DEFAULT_SHELF_MIN_COUNT = 3;

/** Parses the shelf minimum from its raw setting. Anything not a whole number of 1 or more gives the default. */
export function parseShelfMinCount(raw: string | undefined): number {
  const n = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isInteger(n) && n >= 1 && String(n) === (raw ?? "").trim() ? n : DEFAULT_SHELF_MIN_COUNT;
}

/**
 * Drops the cards on any shelf (genre) holding fewer than min live titles.
 * A shelf the genre filter names directly is kept whatever its size, so a
 * link to a small shelf still works.
 */
export function applyShelfMinimum(cards: readonly LibraryCard[], min: number, selectedGenre?: string): LibraryCard[] {
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(c.genreId, (counts.get(c.genreId) ?? 0) + 1);
  return cards.filter((c) => c.genreId === selectedGenre || (counts.get(c.genreId) ?? 0) >= min);
}

/**
 * Applies every filter in the query. Filters combine with AND. Mine and In
 * progress need the reader's enrolments; with none passed they match nothing.
 */
export function filterLibrary(cards: readonly LibraryCard[], query: LibraryQuery, enrolments: ReadonlyMap<string, EnrolmentStatus> | null = null): LibraryCard[] {
  const q = (query.q ?? "").trim().toLowerCase();
  return cards.filter((c) => {
    if (query.genre && c.genreId !== query.genre) return false;
    if (query.theme && c.themeId !== query.theme) return false;
    if (query.author && !(c.authorRefs ?? []).some((a) => a.slug === query.author)) return false;
    if (query.lang && (c.language ?? "") !== query.lang) return false;
    if (query.length && lengthBucket(c.unitCount) !== query.length) return false;
    const status = enrolments?.get(c.id);
    if (query.mine && !status) return false;
    if (query.progress && (!status || status === "finished")) return false;
    if (q && !c.title.toLowerCase().includes(q) && !(c.shortTitle ?? "").toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Chip options drawn from a set of cards: authors, languages and length buckets present, sorted for display. */
export function filterOptions(cards: readonly LibraryCard[]): {
  authors: { slug: string; name: string }[];
  languages: string[];
  lengths: LengthBucket[];
} {
  const authors = new Map<string, string>();
  const languages = new Set<string>();
  const lengths = new Set<LengthBucket>();
  for (const c of cards) {
    for (const a of c.authorRefs ?? []) authors.set(a.slug, a.name);
    if (c.language) languages.add(c.language);
    const b = lengthBucket(c.unitCount);
    if (b) lengths.add(b);
  }
  return {
    authors: [...authors.entries()].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name)),
    languages: [...languages].sort(),
    lengths: LENGTH_BUCKETS.filter((b) => lengths.has(b)),
  };
}
