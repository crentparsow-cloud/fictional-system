import type { LibraryCard } from "@/lib/catalogue-types";
import type { Suggestion } from "@/lib/today/cards";

/**
 * The suggestion card's candidates (4.1). Until Explore marks the "Start
 * here" titles (2.5), start_here is the shortest complete title with no
 * wellbeing tier that the reader has not opened. Change pickStartHere() when
 * the marker exists; nothing else reads it.
 */

export interface SuggestInput {
  cards: readonly LibraryCard[];
  enrolledWorkbookIds: ReadonlySet<string>;
  /** Theme ids of the reader's open programmes. */
  enrolledThemeIds: ReadonlySet<string>;
  enrolledGenreIds: ReadonlySet<string>;
  /** Workbooks the membership does not cover. */
  outsideMembership: ReadonlySet<string>;
}

const byTitle = (a: LibraryCard, b: LibraryCard) => a.title.localeCompare(b.title, "en-GB");
const length = (c: LibraryCard) => c.unitCount ?? 999;

function toSuggestion(kind: Suggestion["kind"], c: LibraryCard): Suggestion {
  return { kind, slug: c.slug, title: c.shortTitle ?? c.title, line: c.cardLine };
}

export function pickStartHere(pool: readonly LibraryCard[]): LibraryCard | null {
  return [...pool].filter((c) => c.safetyTier === "none").sort((a, b) => length(a) - length(b) || byTitle(a, b))[0] ?? null;
}

export function buildSuggestions(i: SuggestInput): Suggestion[] {
  const pool = i.cards.filter((c) => !i.enrolledWorkbookIds.has(c.id) && !c.isDemo && c.hasVersion && c.depth !== "listing");
  const out: Suggestion[] = [];

  // Related: the same Theme as something they are doing. A wellbeing title only when they already have that Theme open.
  const related = pool.filter((c) => c.themeId && i.enrolledThemeIds.has(c.themeId)).sort(byTitle)[0];
  if (related) out.push(toSuggestion("related", related));

  // Next programme (the first 30 days of a membership): covered by the membership, no wellbeing tier, same genre first, shorter first.
  const next = pool
    .filter((c) => c.safetyTier === "none" && !i.outsideMembership.has(c.id))
    .sort((a, b) => Number(i.enrolledGenreIds.has(b.genreId)) - Number(i.enrolledGenreIds.has(a.genreId)) || length(a) - length(b) || byTitle(a, b))[0];
  if (next) out.push(toSuggestion("next_programme", next));

  const start = pickStartHere(pool);
  if (start) out.push(toSuggestion("start_here", start));
  return out;
}
