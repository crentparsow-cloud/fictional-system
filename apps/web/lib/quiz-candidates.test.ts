import { describe, expect, it } from "vitest";
import type { LibraryCard, ShelfWithThemes } from "@/lib/catalogue-types";
import { buildQuizCatalogue } from "@/lib/quiz-candidates";

const card = (slug: string, themeId: string | null, over: Partial<LibraryCard> = {}): LibraryCard => ({
  id: slug,
  code: `AK-${slug}`,
  slug,
  title: slug,
  shortTitle: null,
  cardLine: "Line",
  genreId: "g",
  genreName: "G",
  themeId,
  themeName: themeId,
  badge: "official",
  isDemo: false,
  depth: "full",
  safetyTier: "none",
  authors: [],
  hasVersion: true,
  unitCount: 6,
  unitKind: "week",
  freeUnits: 1,
  ...over,
});

const shelves: ShelfWithThemes[] = [
  { id: "money", name: "Money", themes: [{ id: "paying-it-down", name: "Paying It Down", line: null }, { id: "patient-investing", name: "Patient Investing", line: null }] },
  { id: "work-and-career", name: "Work", themes: [{ id: "words-that-land", name: "Words That Land", line: null }] },
];

describe("quiz candidates", () => {
  it("puts each title on the shelf its Theme belongs to and carries the free label", () => {
    const { candidates } = buildQuizCatalogue([card("debt", "paying-it-down")], shelves);
    expect(candidates[0]).toMatchObject({ slug: "debt", shelfId: "money", freeLabel: "Week 1 is free, no card", minutesPerDay: null });
  });

  it("lists only shelves and Themes that have a startable title", () => {
    const { shelves: out } = buildQuizCatalogue([card("debt", "paying-it-down"), card("outline", "patient-investing", { hasVersion: false })], shelves);
    expect(out).toEqual([{ id: "money", themes: [{ id: "paying-it-down", name: "Paying It Down", line: null }] }]);
  });

  it("copes with a title that has no Theme", () => {
    const { candidates } = buildQuizCatalogue([card("loose", null)], shelves);
    expect(candidates[0]!.shelfId).toBeNull();
  });
});
