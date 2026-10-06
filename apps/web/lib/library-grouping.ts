import type { LibraryCard } from "@/lib/catalogue-types";

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

/** Filter chips carry their state in the URL. This builds the href for one chip. */
export function chipHref(base: string, current: { genre?: string; theme?: string; q?: string }, change: { genre?: string | null; theme?: string | null }): string {
  const params = new URLSearchParams();
  const genre = change.genre === undefined ? current.genre : change.genre;
  const theme = change.theme === undefined ? current.theme : change.theme;
  if (genre) params.set("genre", genre);
  if (theme) params.set("theme", theme);
  if (current.q) params.set("q", current.q);
  const s = params.toString();
  return s ? `${base}?${s}` : base;
}
