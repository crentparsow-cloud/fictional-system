import type { LibraryCard, ShelfWithThemes } from "@/lib/catalogue-types";
import { firstUnitFreeLabel } from "@/lib/free-label";
import type { QuizCandidate } from "@/lib/quiz";

/** What the quiz page hands the browser: titles to choose from and the Themes to ask about. */
export interface QuizCatalogue {
  candidates: QuizCandidate[];
  /** Shelves with at least one title, with their Themes that have one. */
  shelves: { id: string; themes: { id: string; name: string; line: string | null }[] }[];
}

/**
 * Library cards as quiz candidates, and the shelves and Themes that have a
 * title. The card carries its Theme id; the shelf comes from the shelf list.
 * Only titles with a published, complete first unit are in the library list
 * at all (policy 7.9), so every candidate can be started.
 */
export function buildQuizCatalogue(cards: readonly LibraryCard[], shelves: readonly ShelfWithThemes[]): QuizCatalogue {
  const shelfOfTheme = new Map<string, string>();
  for (const s of shelves) for (const t of s.themes) shelfOfTheme.set(t.id, s.id);

  const candidates: QuizCandidate[] = cards.map((c) => ({
    slug: c.slug,
    title: c.title,
    cardLine: c.cardLine,
    themeId: c.themeId,
    themeName: c.themeName,
    shelfId: c.themeId ? (shelfOfTheme.get(c.themeId) ?? null) : null,
    isDemo: c.isDemo,
    safetyTier: c.safetyTier,
    unitCount: c.unitCount ?? null,
    minutesPerDay: null,
    hasVersion: c.hasVersion,
    freeLabel: firstUnitFreeLabel({ hasVersion: c.hasVersion, unit: c.unitKind, freeUnits: c.freeUnits }),
  }));

  const themeHasTitle = new Set(candidates.filter((c) => c.hasVersion && c.themeId).map((c) => c.themeId as string));
  const out: QuizCatalogue["shelves"] = [];
  for (const s of shelves) {
    const themes = s.themes.filter((t) => themeHasTitle.has(t.id));
    if (themes.length) out.push({ id: s.id, themes });
  }
  return { candidates, shelves: out };
}
