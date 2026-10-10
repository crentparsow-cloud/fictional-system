import type { EnrolmentStatus, LibraryCard } from "@/lib/catalogue-types";

/**
 * The pure rules behind Explore, the shelf pages, collections, related titles
 * and My workbooks (build list 2.1, 2.2, 2.3, 2.4, 2.6, 2.12). No Next.js or
 * Supabase here, so the ranking, the filters and the collection resolution
 * are unit tested. The pages hand in cards that have already passed the
 * first-unit rule (listLibrary) and the Theme gate (maskHiddenThemes), so
 * nothing in this file can bring a withheld title back.
 */

// ---------------------------------------------------------------------------
// Signals and ranking
// ---------------------------------------------------------------------------

/** Readers who started a title, and readers who finished it. Counts from public.explore_signals. */
export interface Signal {
  starts: number;
  finishes: number;
}

/** Signals by workbook id. */
export type Signals = ReadonlyMap<string, Signal>;

/**
 * A finish rate means little on a handful of readers. Below this many starts
 * a title is ranked on starts alone, after every title with a usable rate.
 */
export const MIN_STARTS_FOR_RATE = 10;

/** Finish rate 0 to 1, or null while the title has fewer than MIN_STARTS_FOR_RATE starts. */
export function finishRate(signal: Signal | undefined): number | null {
  if (!signal || signal.starts < MIN_STARTS_FOR_RATE) return null;
  return Math.min(1, Math.max(0, signal.finishes / signal.starts));
}

function byTitle(a: LibraryCard, b: LibraryCard): number {
  return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

/**
 * Ranked by finish rate where the counts exist. Titles with a usable rate come
 * first, highest rate first, ties broken by starts. The rest follow by starts.
 * Title order settles every remaining tie, so the order is stable.
 */
export function rankByEngagement(cards: readonly LibraryCard[], signals: Signals): LibraryCard[] {
  return [...cards].sort((a, b) => {
    const sa = signals.get(a.id);
    const sb = signals.get(b.id);
    const ra = finishRate(sa);
    const rb = finishRate(sb);
    if (ra !== null && rb === null) return -1;
    if (ra === null && rb !== null) return 1;
    if (ra !== null && rb !== null && ra !== rb) return rb - ra;
    return (sb?.starts ?? 0) - (sa?.starts ?? 0) || byTitle(a, b);
  });
}

/** Ranked by starts alone, for the Most started rail. Titles nobody has started are left out. */
export function rankByStarts(cards: readonly LibraryCard[], signals: Signals): LibraryCard[] {
  return cards
    .filter((c) => (signals.get(c.id)?.starts ?? 0) > 0)
    .sort((a, b) => (signals.get(b.id)?.starts ?? 0) - (signals.get(a.id)?.starts ?? 0) || byTitle(a, b));
}

// ---------------------------------------------------------------------------
// Programme length (2.4)
// ---------------------------------------------------------------------------

/** The length filter on Explore: up to 4 weeks, up to 8 weeks, longer (12). */
export type ProgrammeLength = "4" | "8" | "12";
export const PROGRAMME_LENGTHS: readonly ProgrammeLength[] = ["4", "8", "12"];

/**
 * The programme in weeks, from the programme data (unitCount and unitKind).
 * A day-by-day programme counts in whole weeks, rounded up. Null when the
 * programme data does not say.
 */
export function programmeWeeks(card: Pick<LibraryCard, "unitCount" | "unitKind">): number | null {
  const n = card.unitCount;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 1) return null;
  if (card.unitKind === "day") return Math.ceil(n / 7);
  if (card.unitKind === "module" || card.unitKind === "chapter") return null;
  return n;
}

/** Which length bucket a number of weeks falls in. */
export function lengthBucketOf(weeks: number): ProgrammeLength {
  if (weeks <= 4) return "4";
  if (weeks <= 8) return "8";
  return "12";
}

/**
 * The badge text on a card: "4 weeks", "8 weeks", "12 weeks", read from the
 * programme data. A one-week programme reads "1 week". A programme counted in
 * modules or chapters says so. Null when nothing is known.
 */
export function lengthBadge(card: Pick<LibraryCard, "unitCount" | "unitKind">): string | null {
  const n = card.unitCount;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 1) return null;
  const kind = card.unitKind ?? "week";
  return `${n} ${kind}${n === 1 ? "" : "s"}`;
}

export function parseProgrammeLength(raw: string | string[] | undefined): ProgrammeLength | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (PROGRAMME_LENGTHS as readonly string[]).includes(v ?? "") ? (v as ProgrammeLength) : undefined;
}

export function filterByLength(cards: readonly LibraryCard[], length: ProgrammeLength | undefined): LibraryCard[] {
  if (!length) return [...cards];
  return cards.filter((c) => {
    const w = programmeWeeks(c);
    return w !== null && lengthBucketOf(w) === length;
  });
}

/** The buckets that hold at least one of these cards, in order, for the filter chips. */
export function lengthOptions(cards: readonly LibraryCard[]): ProgrammeLength[] {
  const present = new Set<ProgrammeLength>();
  for (const c of cards) {
    const w = programmeWeeks(c);
    if (w !== null) present.add(lengthBucketOf(w));
  }
  return PROGRAMME_LENGTHS.filter((l) => present.has(l));
}

// ---------------------------------------------------------------------------
// Rails
// ---------------------------------------------------------------------------

export const RAIL_SIZE = 8;
export const NEW_WINDOW_DAYS = 7;
export const SHORT_PROGRAMME_WEEKS = 4;

/** Titles added in the last seven days, newest first. */
export function newThisWeek(cards: readonly LibraryCard[], now: Date, limit = RAIL_SIZE): LibraryCard[] {
  const since = now.getTime() - NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return cards
    .filter((c) => {
      const t = c.addedAt ? Date.parse(c.addedAt) : NaN;
      return Number.isFinite(t) && t >= since && t <= now.getTime();
    })
    .sort((a, b) => Date.parse(b.addedAt!) - Date.parse(a.addedAt!) || byTitle(a, b))
    .slice(0, limit);
}

/** Programmes of four weeks or fewer, ranked by finish rate where the counts exist. */
export function shortProgrammes(cards: readonly LibraryCard[], signals: Signals, limit = RAIL_SIZE): LibraryCard[] {
  const short = cards.filter((c) => {
    const w = programmeWeeks(c);
    return w !== null && w <= SHORT_PROGRAMME_WEEKS;
  });
  return rankByEngagement(short, signals).slice(0, limit);
}

export function mostStarted(cards: readonly LibraryCard[], signals: Signals, limit = RAIL_SIZE): LibraryCard[] {
  return rankByStarts(cards, signals).slice(0, limit);
}

/** What the reader has already opened, for "Because you read X". */
export interface ReadSeed {
  workbookId: string;
  status: EnrolmentStatus;
  lastOpenedAt: string;
}

export interface BecauseRail {
  seed: LibraryCard;
  /** Why these: the same Theme, or failing that the same shelf. */
  basis: "theme" | "shelf";
  cards: LibraryCard[];
}

/**
 * "Because you read X". Takes the reader's most recently opened enrolment
 * that has company, and lists other titles in the same Theme, or in the same
 * shelf when the Theme holds nothing else. Titles the reader already has are
 * left out. Finished titles are preferred as the seed, then the latest
 * opened. Null when the reader has no enrolments or nothing else matches.
 *
 * shelfOfTheme maps a Theme id to its shelf id.
 */
export function becauseYouRead(
  cards: readonly LibraryCard[],
  seeds: readonly ReadSeed[],
  shelfOfTheme: ReadonlyMap<string, string>,
  signals: Signals,
  limit = RAIL_SIZE,
): BecauseRail | null {
  if (seeds.length === 0) return null;
  const byId = new Map(cards.map((c) => [c.id, c]));
  const owned = new Set(seeds.map((s) => s.workbookId));
  const ordered = [...seeds].sort(
    (a, b) => Number(b.status === "finished") - Number(a.status === "finished") || Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt),
  );
  for (const seed of ordered) {
    const seedCard = byId.get(seed.workbookId);
    if (!seedCard) continue;
    const others = cards.filter((c) => !owned.has(c.id));
    if (seedCard.themeId) {
      const same = others.filter((c) => c.themeId === seedCard.themeId);
      if (same.length) return { seed: seedCard, basis: "theme", cards: rankByEngagement(same, signals).slice(0, limit) };
      const shelf = shelfOfTheme.get(seedCard.themeId);
      if (shelf) {
        const onShelf = others.filter((c) => c.themeId && shelfOfTheme.get(c.themeId) === shelf);
        if (onShelf.length) return { seed: seedCard, basis: "shelf", cards: rankByEngagement(onShelf, signals).slice(0, limit) };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shelves
// ---------------------------------------------------------------------------

export interface ShelfRow {
  id: string;
  name: string;
  status: string;
  sort: number;
  held?: boolean;
  editorsLine?: string | null;
  featuredWorkbookId?: string | null;
}

export interface ThemeRef {
  id: string;
  name: string;
  line: string | null;
  shelfId: string | null;
}

export interface ShelfTileData {
  id: string;
  name: string;
  count: number;
}

/** The shelf a card sits on, through its Theme. Cards with no shown Theme sit on no shelf. */
export function cardsOnShelf(cards: readonly LibraryCard[], shelfId: string, shelfOfTheme: ReadonlyMap<string, string>): LibraryCard[] {
  return cards.filter((c) => c.themeId && shelfOfTheme.get(c.themeId) === shelfId);
}

/**
 * The tiles: every shelf that is not retired, in its set order, with the
 * count of live titles on it. A shelf held back since launch (F-148) stays
 * out until its Themes hold the minimum between them, which hiddenThemeIds
 * has already decided: such a shelf has no shown Theme, so its count is 0 and
 * `held` keeps it off the page.
 */
export function shelfTiles(shelves: readonly ShelfRow[], cards: readonly LibraryCard[], shelfOfTheme: ReadonlyMap<string, string>): ShelfTileData[] {
  return [...shelves]
    .filter((s) => s.status !== "retired")
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map((s) => ({ id: s.id, name: s.name, count: cardsOnShelf(cards, s.id, shelfOfTheme).length, held: s.held === true }))
    .filter((s) => !(s.held && s.count === 0))
    .map(({ id, name, count }) => ({ id, name, count }));
}

/**
 * The featured title for a shelf page: the staff choice when it is still on
 * the shelf (live, first unit complete, Theme shown), otherwise the title
 * ranked first by engagement. Null for an empty shelf.
 */
export function featuredTitle(shelfCards: readonly LibraryCard[], chosenId: string | null | undefined, signals: Signals): LibraryCard | null {
  if (chosenId) {
    const chosen = shelfCards.find((c) => c.id === chosenId);
    if (chosen) return chosen;
  }
  return rankByEngagement(shelfCards, signals)[0] ?? null;
}

/** Themes with at least one shown title on the shelf, with their counts, by name. */
export function themesOnShelf(
  themes: readonly ThemeRef[],
  shelfCards: readonly LibraryCard[],
  shelfId: string,
): (ThemeRef & { count: number })[] {
  const counts = new Map<string, number>();
  for (const c of shelfCards) if (c.themeId) counts.set(c.themeId, (counts.get(c.themeId) ?? 0) + 1);
  return themes
    .filter((t) => t.shelfId === shelfId && (counts.get(t.id) ?? 0) > 0)
    .map((t) => ({ ...t, count: counts.get(t.id) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/** A collection shows only when this many of its titles are visible. */
export const COLLECTION_MIN_TITLES = 3;

export interface CollectionRow {
  id: string;
  slug: string;
  name: string;
  line: string;
  coverGenre: string;
  coverPattern: string | null;
  sort: number;
  /** Workbook ids in staff order. */
  items: { workbookId: string; position: number }[];
}

export interface ResolvedCollection extends Omit<CollectionRow, "items"> {
  cards: LibraryCard[];
}

/**
 * Collections with their titles as cards, in staff order. A title that is not
 * in `cards` (not live, first unit incomplete, other tenant) is dropped
 * silently. A collection left with fewer than COLLECTION_MIN_TITLES titles is
 * not shown. Collections keep their set order, then name.
 */
export function resolveCollections(rows: readonly CollectionRow[], cards: readonly LibraryCard[], min = COLLECTION_MIN_TITLES): ResolvedCollection[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const out: ResolvedCollection[] = [];
  for (const row of rows) {
    const resolved = [...row.items]
      .sort((a, b) => a.position - b.position)
      .map((i) => byId.get(i.workbookId))
      .filter((c): c is LibraryCard => c !== undefined);
    if (resolved.length < min) continue;
    const { items: _items, ...rest } = row;
    void _items;
    out.push({ ...rest, cards: resolved });
  }
  return out.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Related titles (2.6)
// ---------------------------------------------------------------------------

export const RELATED_LIMIT = 6;

/**
 * Up to six related titles for the public workbook page. A title qualifies
 * when it shares the Theme, an author, or the programme length bucket with
 * this one. Theme counts most, then author, then length; a title that shares
 * more ranks higher. Ties fall to title order. The title itself never
 * appears. Cards must be the visible ones (first-unit rule applied).
 */
export function relatedTitles(current: LibraryCard, cards: readonly LibraryCard[], limit = RELATED_LIMIT): LibraryCard[] {
  const authors = new Set((current.authorRefs ?? []).map((a) => a.slug));
  const weeks = programmeWeeks(current);
  const bucket = weeks === null ? null : lengthBucketOf(weeks);
  const scored: { card: LibraryCard; score: number }[] = [];
  for (const c of cards) {
    if (c.id === current.id) continue;
    let score = 0;
    if (current.themeId && c.themeId === current.themeId) score += 4;
    if (authors.size && (c.authorRefs ?? []).some((a) => authors.has(a.slug))) score += 2;
    const w = programmeWeeks(c);
    if (bucket && w !== null && lengthBucketOf(w) === bucket) score += 1;
    if (score > 0) scored.push({ card: c, score });
  }
  return scored.sort((a, b) => b.score - a.score || byTitle(a.card, b.card)).slice(0, limit).map((s) => s.card);
}

// ---------------------------------------------------------------------------
// My workbooks (2.12)
// ---------------------------------------------------------------------------

export type MineFilter = "all" | "reading" | "finished";
export type MineSort = "opened" | "title";

export const MINE_FILTERS: readonly MineFilter[] = ["all", "reading", "finished"];
export const MINE_SORTS: readonly MineSort[] = ["opened", "title"];

export interface MineRow {
  enrolmentId: string;
  workbookId: string;
  slug: string;
  code: string;
  title: string;
  shortTitle: string | null;
  badge: LibraryCard["badge"];
  isDemo: boolean;
  safetyTier: LibraryCard["safetyTier"];
  status: EnrolmentStatus;
  startedAt: string;
  lastOpenedAt: string;
  unitCount: number | null;
  unitKind: LibraryCard["unitKind"];
  authors: string[];
}

export function parseMineFilter(raw: string | string[] | undefined): MineFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (MINE_FILTERS as readonly string[]).includes(v ?? "") ? (v as MineFilter) : "all";
}

export function parseMineSort(raw: string | string[] | undefined): MineSort {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (MINE_SORTS as readonly string[]).includes(v ?? "") ? (v as MineSort) : "opened";
}

/** The chip a status carries. Active reads as "reading". */
export function statusChip(status: EnrolmentStatus): "reading" | "finished" | "paused" {
  return status === "active" ? "reading" : status;
}

/** All shows everything, Reading shows active enrolments, Finished shows finished ones. Paused titles show under All. */
export function filterMine(rows: readonly MineRow[], filter: MineFilter): MineRow[] {
  if (filter === "reading") return rows.filter((r) => r.status === "active");
  if (filter === "finished") return rows.filter((r) => r.status === "finished");
  return [...rows];
}

/** Last opened puts the most recent first. Title is A to Z. Title settles ties. */
export function sortMine(rows: readonly MineRow[], sort: MineSort): MineRow[] {
  const title = (a: MineRow, b: MineRow) => a.title.localeCompare(b.title) || a.enrolmentId.localeCompare(b.enrolmentId);
  return [...rows].sort((a, b) => (sort === "title" ? title(a, b) : Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt) || title(a, b)));
}

export function mineCounts(rows: readonly MineRow[]): Record<MineFilter, number> {
  return {
    all: rows.length,
    reading: rows.filter((r) => r.status === "active").length,
    finished: rows.filter((r) => r.status === "finished").length,
  };
}
