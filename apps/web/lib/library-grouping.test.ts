import { describe, expect, it } from "vitest";
import type { LibraryCard } from "./catalogue-types";
import { chipHref, groupLibrary } from "./library-grouping";

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
