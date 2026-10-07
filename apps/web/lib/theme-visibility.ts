import type { LibraryCard } from "@/lib/catalogue-types";

/**
 * The three-book rule for Themes and shelves added after launch (F-148).
 *
 * Migration 0015 marks each new Theme and shelf hidden_until_min_books. A
 * reader does not see such a Theme (its name, chip, heading or page) until
 * it holds min_books live titles, and a held shelf stays out of /themes until
 * its Themes hold that many between them. Rows without the flag (the 17
 * launch Themes and 7 launch shelves) keep their current behaviour: they show
 * as soon as one title is live, and a Theme page renders even when empty.
 *
 * A live workbook on a hidden Theme is still a live workbook: its card stays
 * in the library, just without the Theme label or link. Pure, so the library
 * and /themes pages share one decision and the tests cover it.
 */

export const DEFAULT_THEME_MIN_BOOKS = 3;

export interface ThemeGate {
  id: string;
  shelfId: string | null;
  /** themes.hidden_until_min_books. Missing reads as false (launch behaviour). */
  held?: boolean;
  /** themes.min_books. Missing or below 1 reads as the default of 3. */
  minBooks?: number | null;
  /** shelves.hidden_until_min_books for the Theme's shelf. */
  shelfHeld?: boolean;
}

function minimum(n: number | null | undefined): number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 ? n : DEFAULT_THEME_MIN_BOOKS;
}

/** Live titles per Theme id among the cards. */
export function liveCountsByTheme(cards: readonly LibraryCard[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of cards) if (c.themeId) counts.set(c.themeId, (counts.get(c.themeId) ?? 0) + 1);
  return counts;
}

/** May a reader see this one Theme, given how many live titles it holds? */
export function themeShown(theme: Pick<ThemeGate, "held" | "minBooks">, liveCount: number): boolean {
  if (!theme.held) return true;
  return liveCount >= minimum(theme.minBooks);
}

/**
 * The ids of every Theme a reader must not see: a held Theme below its
 * minimum, or any Theme on a held shelf whose shown Themes hold fewer than
 * the default minimum between them.
 */
export function hiddenThemeIds(themes: readonly ThemeGate[], cards: readonly LibraryCard[]): Set<string> {
  const counts = liveCountsByTheme(cards);
  const hidden = new Set<string>();
  for (const t of themes) if (!themeShown(t, counts.get(t.id) ?? 0)) hidden.add(t.id);

  const shelfTotals = new Map<string, number>();
  for (const t of themes) {
    if (!t.shelfHeld || !t.shelfId || hidden.has(t.id)) continue;
    shelfTotals.set(t.shelfId, (shelfTotals.get(t.shelfId) ?? 0) + (counts.get(t.id) ?? 0));
  }
  for (const t of themes) {
    if (t.shelfHeld && t.shelfId && (shelfTotals.get(t.shelfId) ?? 0) < DEFAULT_THEME_MIN_BOOKS) hidden.add(t.id);
  }
  return hidden;
}

/** The cards with any hidden Theme's id and name taken off. Cards themselves are kept. */
export function maskHiddenThemes(cards: readonly LibraryCard[], hidden: ReadonlySet<string>): LibraryCard[] {
  if (hidden.size === 0) return [...cards];
  return cards.map((c) => (c.themeId && hidden.has(c.themeId) ? { ...c, themeId: null, themeName: null } : c));
}
