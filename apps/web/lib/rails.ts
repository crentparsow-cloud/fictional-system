import type { EnrolmentStatus, LibraryCard } from "@/lib/catalogue-types";
import { MIN_STARTS_FOR_RATE, RAIL_SIZE, programmeWeeks, SHORT_PROGRAMME_WEEKS, type ShelfRow } from "@/lib/explore";

/**
 * Personalised rails on Explore (build list 2.9), and the followed authors
 * rail (2.10). A fixed rule set decides which rails a reader gets and what
 * goes in them. No model and no profile: each rule reads only what the reader
 * already did on this site (titles started, titles finished, authors followed)
 * and ranks the candidates by how other readers fared, using the counts
 * already collected in public.rail_signals (0056).
 *
 * Ranking. A title with enough starts is scored 60 percent on the share of
 * its readers who finished and 40 percent on the share who came back to
 * finish a step a week or more after starting. Titles without enough starts
 * follow, by starts, then by title. The scores never reach the page.
 *
 * Rails say "More in {Theme}", never the title the reader read, so a screen
 * glanced at over a shoulder does not name what they are working on. Nothing
 * here counts days, streaks or missed days.
 *
 * Pure: the pages hand in cards that already passed the first-unit rule and
 * the Theme gate, so nothing here can bring a withheld title back.
 */

export interface RailSignal {
  starts: number;
  finishes: number;
  /** Readers who finished a step at least seven days after they started. */
  returned: number;
}
export type RailSignals = ReadonlyMap<string, RailSignal>;

export const FINISH_WEIGHT = 0.6;
export const RETURN_WEIGHT = 0.4;
/** The most rails a reader gets from the rule set. */
export const MAX_PERSONAL_RAILS = 4;
/** Fewest cards for a rail to be worth showing. Followed authors show from one. */
export const MIN_RAIL_CARDS = 2;

/** 0 to 1, or null while the title has fewer than MIN_STARTS_FOR_RATE starts. */
export function railScore(signal: RailSignal | undefined): number | null {
  if (!signal || signal.starts < MIN_STARTS_FOR_RATE) return null;
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const finish = clamp(signal.finishes / signal.starts);
  const back = clamp(signal.returned / signal.starts);
  return FINISH_WEIGHT * finish + RETURN_WEIGHT * back;
}

function byTitle(a: LibraryCard, b: LibraryCard): number {
  return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

/** Best score first. Titles with no usable score follow, by starts, then by title. */
export function rankByRailScore(cards: readonly LibraryCard[], signals: RailSignals): LibraryCard[] {
  return [...cards].sort((a, b) => {
    const sa = railScore(signals.get(a.id));
    const sb = railScore(signals.get(b.id));
    if (sa !== null && sb === null) return -1;
    if (sa === null && sb !== null) return 1;
    if (sa !== null && sb !== null && sa !== sb) return sb - sa;
    return (signals.get(b.id)?.starts ?? 0) - (signals.get(a.id)?.starts ?? 0) || byTitle(a, b);
  });
}

/** What the reader has done with each title they started. */
export interface RailSeed {
  workbookId: string;
  status: EnrolmentStatus;
  lastOpenedAt: string;
}

export interface RailContext {
  cards: readonly LibraryCard[];
  signals: RailSignals;
  seeds: readonly RailSeed[];
  /** Slugs of the authors the reader follows. */
  followedAuthors: ReadonlySet<string>;
  shelfOfTheme: ReadonlyMap<string, string>;
  shelves: readonly Pick<ShelfRow, "id" | "name">[];
  limit?: number;
}

export type RailRuleId = "followed_authors" | "same_theme" | "same_shelf" | "short_follow_on";

/** The rules, in the order their rails appear. */
export const RAIL_RULES: readonly RailRuleId[] = ["followed_authors", "same_theme", "same_shelf", "short_follow_on"];

export type RailHeading =
  | { key: "followed" }
  | { key: "theme"; name: string }
  | { key: "shelf"; name: string }
  | { key: "short" };

export interface PersonalRail {
  id: string;
  rule: RailRuleId;
  heading: RailHeading;
  cards: LibraryCard[];
}

function recentFirst(seeds: readonly RailSeed[]): RailSeed[] {
  return [...seeds].sort((a, b) => Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt) || a.workbookId.localeCompare(b.workbookId));
}

/**
 * Runs the rule set. A rule that finds too few cards makes no rail. A card
 * appears in one rail only, the first that claims it. A reader with no
 * enrolments and no followed authors gets none, and Explore falls back to its
 * ordinary rails.
 */
export function personalRails(ctx: RailContext): PersonalRail[] {
  const limit = ctx.limit ?? RAIL_SIZE;
  const owned = new Set(ctx.seeds.map((s) => s.workbookId));
  const byId = new Map(ctx.cards.map((c) => [c.id, c]));
  const candidates = ctx.cards.filter((c) => !owned.has(c.id));
  const taken = new Set<string>();
  const out: PersonalRail[] = [];

  const push = (rail: Omit<PersonalRail, "cards">, pool: readonly LibraryCard[], min: number) => {
    if (out.length >= MAX_PERSONAL_RAILS) return;
    const cards = rankByRailScore(pool.filter((c) => !taken.has(c.id)), ctx.signals).slice(0, limit);
    if (cards.length < min) return;
    for (const c of cards) taken.add(c.id);
    out.push({ ...rail, cards });
  };

  const seedCards = recentFirst(ctx.seeds)
    .map((s) => ({ seed: s, card: byId.get(s.workbookId) }))
    .filter((x): x is { seed: RailSeed; card: LibraryCard } => Boolean(x.card));
  const finished = seedCards.filter((x) => x.seed.status === "finished");
  // Finished titles speak loudest; the title being read now comes next.
  const basis = [...finished, ...seedCards.filter((x) => x.seed.status !== "finished")];

  for (const rule of RAIL_RULES) {
    if (rule === "followed_authors") {
      if (ctx.followedAuthors.size === 0) continue;
      const pool = candidates.filter((c) => (c.authorRefs ?? []).some((a) => ctx.followedAuthors.has(a.slug)));
      push({ id: "followed", rule, heading: { key: "followed" } }, pool, 1);
    } else if (rule === "same_theme") {
      const seen = new Set<string>();
      for (const { card } of basis) {
        if (!card.themeId || !card.themeName || seen.has(card.themeId)) continue;
        seen.add(card.themeId);
        if (seen.size > 2) break;
        const pool = candidates.filter((c) => c.themeId === card.themeId);
        push({ id: `theme-${card.themeId}`, rule, heading: { key: "theme", name: card.themeName } }, pool, MIN_RAIL_CARDS);
      }
    } else if (rule === "same_shelf") {
      const seen = new Set<string>();
      for (const { card } of basis) {
        const shelfId = card.themeId ? ctx.shelfOfTheme.get(card.themeId) : undefined;
        if (!shelfId || seen.has(shelfId)) continue;
        seen.add(shelfId);
        if (seen.size > 1) break;
        const name = ctx.shelves.find((s) => s.id === shelfId)?.name;
        if (!name) continue;
        const pool = candidates.filter((c) => c.themeId && ctx.shelfOfTheme.get(c.themeId) === shelfId);
        push({ id: `shelf-${shelfId}`, rule, heading: { key: "shelf", name } }, pool, MIN_RAIL_CARDS);
      }
    } else if (rule === "short_follow_on") {
      if (finished.length === 0) continue;
      const pool = candidates.filter((c) => {
        const w = programmeWeeks(c);
        return w !== null && w <= SHORT_PROGRAMME_WEEKS;
      });
      push({ id: "short", rule, heading: { key: "short" } }, pool, MIN_RAIL_CARDS);
    }
  }
  return out;
}

/** Message key and values for a rail heading. */
export function railHeadingMessage(h: RailHeading): { key: "rails.followed" | "rails.theme" | "rails.shelf" | "rails.short"; values?: { name: string } } {
  switch (h.key) {
    case "followed":
      return { key: "rails.followed" };
    case "theme":
      return { key: "rails.theme", values: { name: h.name } };
    case "shelf":
      return { key: "rails.shelf", values: { name: h.name } };
    default:
      return { key: "rails.short" };
  }
}
