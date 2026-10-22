import type { LibraryCard } from "@/lib/catalogue-types";
import { themeIndex, type ThemeInput } from "@/lib/author-theme-pages";

export interface CategoryChip {
  id: string;
  name: string;
  href: string;
  /** The shelf the Theme sits on; it sets the chip's tint. Null falls back to a neutral tint. */
  shelfId: string | null;
}

/**
 * The Categories chips on Explore: one per Theme that has at least one
 * visible workbook, read from the same data as the Themes list (so retired
 * and held Themes never appear). Ordered shelf by shelf, then by name.
 */
export function categoryChips(themes: readonly ThemeInput[], cards: readonly LibraryCard[]): CategoryChip[] {
  return themeIndex(themes, cards).flatMap((shelf) => shelf.themes.map((t) => ({ id: t.id, name: t.name, href: `/themes/${t.id}`, shelfId: t.shelfId })));
}
