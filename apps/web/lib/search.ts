import type { Badge, LibraryCard } from "@/lib/catalogue-types";
import type { Translate } from "@/lib/locale";
import { isCrisisQuery, normaliseQuery } from "@/lib/search-safety";

/**
 * On-device search (F-008). The page ships a small index of what the reader
 * can already see (titles, authors, publisher, Theme, shelf, code, card line
 * and the Theme's hidden topic terms) and this module searches it in the
 * browser. The query is never sent, stored or logged: no fetch, no URL
 * parameter, no analytics. Pure functions, so they are unit tested.
 *
 * Help now first: a query that matches the crisis list (lib/search-safety.ts)
 * puts the Help now card above every result, even when nothing else matches.
 */

export type SearchKind = "workbook" | "unit" | "tool";

/** One searchable item, as shipped to the page. Plain data, safe to serialise. */
export interface SearchEntry {
  id: string;
  kind: SearchKind;
  href: string;
  title: string;
  shortTitle?: string | null;
  authors?: string[];
  publisher?: string | null;
  themeName?: string | null;
  genreName?: string | null;
  code?: string | null;
  line?: string | null;
  /** Hidden Theme topic terms. Searched, never displayed. */
  topics?: string[];
  badge?: Badge;
  isDemo?: boolean;
}

/** Fields in order of weight. A match on the title outranks one in the topics. */
const FIELDS = ["title", "shortTitle", "authors", "themeName", "code", "genreName", "publisher", "line", "topics"] as const;
type Field = (typeof FIELDS)[number];

const WEIGHT: Record<Field, number> = {
  title: 10,
  shortTitle: 9,
  authors: 8,
  themeName: 7,
  code: 7,
  genreName: 5,
  publisher: 4,
  line: 3,
  topics: 3,
};

export interface IndexedEntry {
  entry: SearchEntry;
  /** Each field normalised and padded with spaces, ready for word matching. */
  fields: Record<Field, string>;
}

export type SearchIndex = readonly IndexedEntry[];

function norm(v: string | null | undefined | readonly string[]): string {
  if (Array.isArray(v)) return v.map((s) => normaliseQuery(s)).filter(Boolean).join(" | ");
  return normaliseQuery((v as string | null | undefined) ?? "");
}

/** Builds the index once per page load. Duplicate ids keep the first entry. */
export function buildSearchIndex(entries: readonly SearchEntry[]): SearchIndex {
  const seen = new Set<string>();
  const out: IndexedEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fields = {} as Record<Field, string>;
    for (const f of FIELDS) fields[f] = ` ${norm(entry[f])} `;
    out.push({ entry, fields });
  }
  return out;
}

/**
 * Scores one word of the query against one normalised field: 3 for a whole
 * word, 2 for the start of a word, 1 for inside a word (three letters or
 * more only, so "an" does not match half the catalogue), 0 for no match.
 */
export function wordScore(word: string, field: string): number {
  if (!word || field.trim() === "") return 0;
  if (field.includes(` ${word} `)) return 3;
  if (field.includes(` ${word}`)) return 2;
  if (word.length >= 3 && field.includes(word)) return 1;
  return 0;
}

/**
 * Scores an entry for a normalised query. Every word must match some field
 * (AND), or the entry scores 0. Each word takes its best field. A title that
 * starts with the whole query, or equals it, gets a bonus.
 */
export function scoreEntry(item: IndexedEntry, query: string): number {
  const words = query.split(" ").filter(Boolean);
  if (!words.length) return 0;
  let total = 0;
  for (const word of words) {
    let best = 0;
    for (const f of FIELDS) {
      const s = wordScore(word, item.fields[f]);
      if (s) best = Math.max(best, s * WEIGHT[f]);
    }
    if (!best) return 0;
    total += best;
  }
  const title = item.fields.title.trim();
  if (title === query) total += 40;
  else if (title.startsWith(query)) total += 20;
  return total;
}

export interface SearchOutcome {
  /** True when the Help now card must be the first thing shown. */
  helpNow: boolean;
  /** Matching entries, best first. */
  results: SearchEntry[];
  /** True when the query has something to search for. */
  active: boolean;
}

export const MAX_RESULTS = 50;

/**
 * Runs a query against the index. Help now is decided from the raw query
 * before any matching, and does not depend on there being results.
 */
export function search(index: SearchIndex, raw: string, limit = MAX_RESULTS): SearchOutcome {
  const query = normaliseQuery(raw);
  const helpNow = isCrisisQuery(raw);
  if (!query) return { helpNow, results: [], active: helpNow };
  const scored: { entry: SearchEntry; score: number }[] = [];
  for (const item of index) {
    const score = scoreEntry(item, query);
    if (score > 0) scored.push({ entry: item.entry, score });
  }
  scored.sort((a, b) => b.score - a.score || KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind] || a.entry.title.localeCompare(b.entry.title));
  return { helpNow, results: scored.slice(0, limit).map((s) => s.entry), active: true };
}

const KIND_ORDER: Record<SearchKind, number> = { workbook: 0, tool: 1, unit: 2 };

/** A library card as a search entry. Topics and publisher come from the extras the server adds. */
export function entryFromCard(card: LibraryCard, extras: { topics?: string[]; publisher?: string | null } = {}): SearchEntry {
  return {
    id: card.id,
    kind: "workbook",
    href: `/w/${card.slug}`,
    title: card.title,
    shortTitle: card.shortTitle,
    authors: card.authors,
    publisher: extras.publisher ?? null,
    themeName: card.themeName,
    genreName: card.genreName,
    code: card.code,
    line: card.cardLine,
    topics: extras.topics ?? [],
    badge: card.badge,
    isDemo: card.isDemo,
  };
}

/** Topic terms as plain short strings, at most 40 per Theme. Anything else is dropped. */
export function cleanTopics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 40);
}

/**
 * The words the polite status line announces: the count, with "Help now is
 * shown first." ahead of it on a crisis query. Empty before anything is typed.
 */
export function searchStatus(outcome: SearchOutcome, labels: { countNone: string; countOne: string; count: string; helpFirst: string }): string {
  if (!outcome.active) return "";
  const n = outcome.results.length;
  const count = n === 0 ? labels.countNone : n === 1 ? labels.countOne : labels.count.replace("{count}", String(n));
  return outcome.helpNow ? `${labels.helpFirst} ${count}` : count;
}

/** Interface strings for the search box, from the request's message set. */
export function searchLabels(t: Translate) {
  return {
    label: t("search.label"),
    placeholder: t("search.placeholder"),
    privacy: t("search.privacy"),
    countNone: t("search.countNone"),
    countOne: t("search.countOne"),
    count: t("search.count"),
    helpFirst: t("search.helpFirst"),
    helpTitle: t("search.helpTitle"),
    helpBody: t("search.helpBody"),
    helpCta: t("search.helpCta"),
    results: t("search.results"),
    empty: t("search.empty"),
  };
}
