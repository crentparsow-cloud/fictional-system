import { describe, expect, it } from "vitest";
import type { LibraryCard } from "./catalogue-types";
import {
  applyShelfMinimum,
  chipHref,
  DEFAULT_SHELF_MIN_COUNT,
  filterLibrary,
  filterOptions,
  groupLibrary,
  hasActiveFilters,
  lengthBucket,
  libraryHref,
  parseLibraryQuery,
  parseShelfMinCount,
} from "./library-grouping";

function card(over: Partial<LibraryCard> & Pick<LibraryCard, "id" | "title" | "genreId">): LibraryCard {
  return {
    code: "AK-00000",
    slug: over.id,
    shortTitle: null,
    cardLine: "",
    genreName: over.genreId,
    themeId: null,
    themeName: null,
    badge: "official",
    isDemo: false,
    depth: "full",
    safetyTier: "none",
    authors: [],
    hasVersion: true,
    ...over,
  };
}

describe("library grouping", () => {
  it("groups by shelf then Theme, sorted by name, with untagged cards last", () => {
    const cards = [
      card({ id: "a", title: "Zebra", genreId: "finance", genreName: "Money", themeId: "debt", themeName: "Debt" }),
      card({ id: "b", title: "Apple", genreId: "finance", genreName: "Money", themeId: "debt", themeName: "Debt" }),
      card({ id: "c", title: "Mango", genreId: "finance", genreName: "Money" }),
      card({ id: "d", title: "Calm", genreId: "wellbeing", genreName: "Mind and Mood", themeId: "pause", themeName: "Pause" }),
      card({ id: "e", title: "Budget", genreId: "finance", genreName: "Money", themeId: "budget", themeName: "Budgeting" }),
    ];
    const groups = groupLibrary(cards);
    expect(groups.map((g) => g.genreName)).toEqual(["Mind and Mood", "Money"]);
    const money = groups[1]!;
    expect(money.count).toBe(4);
    expect(money.themes.map((t) => t.themeName)).toEqual(["Budgeting", "Debt", null]);
    expect(money.themes[1]!.cards.map((c) => c.title)).toEqual(["Apple", "Zebra"]);
  });

  it("returns nothing for an empty library", () => {
    expect(groupLibrary([])).toEqual([]);
  });

  it("builds chip hrefs that keep the other filters", () => {
    expect(chipHref("/library", {}, { genre: "finance" })).toBe("/library?genre=finance");
    expect(chipHref("/library", { genre: "finance", q: "debt" }, { theme: "budget" })).toBe("/library?genre=finance&theme=budget&q=debt");
    expect(chipHref("/library", { genre: "finance", theme: "budget" }, { genre: null, theme: null })).toBe("/library");
  });
});

describe("library filters", () => {
  const ana = { slug: "ana-ruiz", name: "Ana Ruiz" };
  const ben = { slug: "ben-okafor", name: "Ben Okafor" };
  const cards = [
    card({ id: "w1", title: "Cash Book", genreId: "business", authorRefs: [ana], language: "en", unitCount: 4 }),
    card({ id: "w2", title: "Calm Evenings", shortTitle: "Evenings", genreId: "wellbeing", authorRefs: [ben], language: "en", unitCount: 12 }),
    card({ id: "w3", title: "Budget Basics", genreId: "finance", themeId: "budget", authorRefs: [ana, ben], language: "fr", unitCount: 6 }),
    card({ id: "w4", title: "Sleep Again", genreId: "wellbeing", authorRefs: [ben], language: "en", unitCount: null }),
  ];

  it("buckets programme length at 4 and 8", () => {
    expect(lengthBucket(1)).toBe("short");
    expect(lengthBucket(4)).toBe("short");
    expect(lengthBucket(5)).toBe("medium");
    expect(lengthBucket(8)).toBe("medium");
    expect(lengthBucket(9)).toBe("long");
    expect(lengthBucket(52)).toBe("long");
    expect(lengthBucket(null)).toBeNull();
    expect(lengthBucket(undefined)).toBeNull();
    expect(lengthBucket(0)).toBeNull();
    expect(lengthBucket(Number.NaN)).toBeNull();
  });

  it("parses search params and drops anything that does not fit", () => {
    expect(parseLibraryQuery({ author: "ana-ruiz", lang: "en", length: "medium", mine: "1", progress: "1", q: "  cash " })).toEqual({
      author: "ana-ruiz",
      lang: "en",
      length: "medium",
      mine: true,
      progress: true,
      q: "cash",
    });
    expect(parseLibraryQuery({ author: "Ana Ruiz", lang: "english", length: "huge", mine: "yes", genre: "x;drop", theme: ["budget", "debt"] })).toEqual({ theme: "budget" });
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ progress: true })).toBe(true);
  });

  it("combines filters with AND", () => {
    const ids = (q: Parameters<typeof filterLibrary>[1]) => filterLibrary(cards, q).map((c) => c.id);
    expect(ids({})).toEqual(["w1", "w2", "w3", "w4"]);
    expect(ids({ author: "ana-ruiz" })).toEqual(["w1", "w3"]);
    expect(ids({ author: "ben-okafor", lang: "en" })).toEqual(["w2", "w4"]);
    expect(ids({ author: "ben-okafor", length: "long" })).toEqual(["w2"]);
    expect(ids({ length: "medium", lang: "fr", genre: "finance", theme: "budget" })).toEqual(["w3"]);
    expect(ids({ q: "evenings" })).toEqual(["w2"]);
    expect(ids({ length: "short", genre: "wellbeing" })).toEqual([]);
  });

  it("matches Mine on any enrolment and In progress on enrolled and not finished", () => {
    const enrolments = new Map([
      ["w1", "active" as const],
      ["w2", "finished" as const],
      ["w3", "paused" as const],
    ]);
    expect(filterLibrary(cards, { mine: true }, enrolments).map((c) => c.id)).toEqual(["w1", "w2", "w3"]);
    expect(filterLibrary(cards, { progress: true }, enrolments).map((c) => c.id)).toEqual(["w1", "w3"]);
    expect(filterLibrary(cards, { mine: true, author: "ben-okafor" }, enrolments).map((c) => c.id)).toEqual(["w2", "w3"]);
    // Signed out: no enrolments, so neither chip matches anything.
    expect(filterLibrary(cards, { mine: true })).toEqual([]);
  });

  it("hides a shelf below the minimum unless the genre filter names it", () => {
    expect(applyShelfMinimum(cards, 2).map((c) => c.id)).toEqual(["w2", "w4"]);
    expect(applyShelfMinimum(cards, 2, "finance").map((c) => c.id)).toEqual(["w2", "w3", "w4"]);
    expect(applyShelfMinimum(cards, 1).map((c) => c.id)).toEqual(["w1", "w2", "w3", "w4"]);
    expect(applyShelfMinimum(cards, 3)).toEqual([]);
  });

  it("reads the shelf minimum with a default of 3", () => {
    expect(DEFAULT_SHELF_MIN_COUNT).toBe(3);
    expect(parseShelfMinCount(undefined)).toBe(3);
    expect(parseShelfMinCount("")).toBe(3);
    expect(parseShelfMinCount("5")).toBe(5);
    expect(parseShelfMinCount(" 1 ")).toBe(1);
    expect(parseShelfMinCount("0")).toBe(3);
    expect(parseShelfMinCount("-2")).toBe(3);
    expect(parseShelfMinCount("2.5")).toBe(3);
    expect(parseShelfMinCount("ten")).toBe(3);
  });

  it("offers only the authors, languages and lengths present", () => {
    const o = filterOptions(cards);
    expect(o.authors).toEqual([ana, ben]);
    expect(o.languages).toEqual(["en", "fr"]);
    expect(o.lengths).toEqual(["short", "medium", "long"]);
    expect(filterOptions([cards[3]!]).lengths).toEqual([]);
  });

  it("builds hrefs that keep every other filter and toggle Mine and In progress", () => {
    const current = { genre: "finance", author: "ana-ruiz", length: "medium" as const, q: "debt" };
    expect(libraryHref("/library", current, { lang: "en" })).toBe("/library?genre=finance&author=ana-ruiz&lang=en&length=medium&q=debt");
    expect(libraryHref("/library", current, { mine: true })).toBe("/library?genre=finance&author=ana-ruiz&length=medium&mine=1&q=debt");
    expect(libraryHref("/library", { mine: true, progress: true }, { mine: false })).toBe("/library?progress=1");
    expect(libraryHref("/library", current, { genre: null, author: null, length: null, q: null })).toBe("/library");
  });
});
