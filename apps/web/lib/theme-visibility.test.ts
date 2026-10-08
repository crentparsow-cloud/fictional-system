import { describe, expect, it } from "vitest";
import { themeIndex } from "./author-theme-pages";
import type { LibraryCard } from "./catalogue-types";
import { hiddenThemeIds, isRetiredStatus, liveCountsByTheme, maskHiddenThemes, themeShown, type ThemeGate } from "./theme-visibility";

function card(id: string, themeId: string | null): LibraryCard {
  return {
    id,
    code: "AK-00000",
    slug: id,
    title: id,
    shortTitle: null,
    cardLine: "",
    genreId: "education",
    genreName: "Education",
    themeId,
    themeName: themeId ? `Name of ${themeId}` : null,
    badge: "official",
    isDemo: false,
    depth: "full",
    safetyTier: "none",
    authors: [],
    hasVersion: true,
  };
}

const launch: ThemeGate = { id: "chosen-habits", shelfId: "personal-growth" };
const newOnOld: ThemeGate = { id: "wisdom-for-living", shelfId: "personal-growth", held: true, minBooks: 3 };
const faithA: ThemeGate = { id: "growing-in-faith", shelfId: "faith-and-spirituality", held: true, minBooks: 3, shelfHeld: true };
// Retired by 0025: Bible study is out of scope for now.
const retired: ThemeGate = { id: "reading-scripture", shelfId: "faith-and-spirituality", held: true, minBooks: 3, shelfHeld: true, retired: true };
const retiredLaunch: ThemeGate = { id: "old-launch-theme", shelfId: "personal-growth", retired: true };
const faithB: ThemeGate = { id: "rhythms-of-prayer", shelfId: "faith-and-spirituality", held: true, minBooks: 3, shelfHeld: true };

describe("themeShown (F-148)", () => {
  it("keeps launch behaviour for a Theme without the flag", () => {
    expect(themeShown(launch, 0)).toBe(true);
    expect(themeShown(launch, 1)).toBe(true);
  });

  it("holds a new Theme until it has its minimum of live titles", () => {
    expect(themeShown(newOnOld, 0)).toBe(false);
    expect(themeShown(newOnOld, 2)).toBe(false);
    expect(themeShown(newOnOld, 3)).toBe(true);
  });

  it("reads a missing or bad minimum as three", () => {
    expect(themeShown({ held: true, minBooks: null }, 2)).toBe(false);
    expect(themeShown({ held: true, minBooks: 0 }, 2)).toBe(false);
    expect(themeShown({ held: true }, 3)).toBe(true);
    expect(themeShown({ held: true, minBooks: 5 }, 4)).toBe(false);
  });
});

describe("hiddenThemeIds and maskHiddenThemes", () => {
  it("hides a held Theme with one or two titles and keeps its cards unlabelled", () => {
    const cards = [card("a", "chosen-habits"), card("b", "wisdom-for-living"), card("c", "wisdom-for-living")];
    const hidden = hiddenThemeIds([launch, newOnOld], cards);
    expect([...hidden]).toEqual(["wisdom-for-living"]);
    const masked = maskHiddenThemes(cards, hidden);
    expect(masked).toHaveLength(3);
    expect(masked.map((c) => c.themeId)).toEqual(["chosen-habits", null, null]);
    expect(masked[1]?.themeName).toBeNull();
    // the input is not changed
    expect(cards[1]?.themeId).toBe("wisdom-for-living");
  });

  it("shows a held Theme once it has three", () => {
    const cards = ["b", "c", "d"].map((id) => card(id, "wisdom-for-living"));
    expect(hiddenThemeIds([newOnOld], cards).size).toBe(0);
  });

  it("holds a new shelf until its shown Themes hold three between them", () => {
    const cards = ["a", "b", "c"].map((id) => card(id, "growing-in-faith"));
    expect(hiddenThemeIds([faithA, faithB], cards)).toEqual(new Set(["rhythms-of-prayer"]));
    expect(hiddenThemeIds([faithA, faithB], cards.slice(0, 2))).toEqual(new Set(["growing-in-faith", "rhythms-of-prayer"]));
  });

  it("drops hidden Themes from the /themes index and its shelf with them", () => {
    const cards = [card("a", "growing-in-faith"), card("b", "chosen-habits")];
    const themes = [
      { ...launch, name: "Chosen Habits", line: null, shelfName: "Personal Growth" },
      { ...faithA, name: "Growing in Faith", line: null, shelfName: "Faith and Spirituality" },
    ];
    const index = themeIndex(themes, maskHiddenThemes(cards, hiddenThemeIds(themes, cards)));
    expect(index.map((s) => s.shelfName)).toEqual(["Personal Growth"]);
    expect(index[0]?.themes.map((t) => t.id)).toEqual(["chosen-habits"]);
  });

  it("counts live titles per Theme", () => {
    expect(liveCountsByTheme([card("a", "x"), card("b", "x"), card("c", null)])).toEqual(new Map([["x", 2]]));
  });
});

describe("retired Themes (0025)", () => {
  it("reads only the status 'retired' as retired", () => {
    expect(isRetiredStatus("retired")).toBe(true);
    expect(isRetiredStatus("active")).toBe(false);
    expect(isRetiredStatus(null)).toBe(false);
    expect(isRetiredStatus(undefined)).toBe(false);
  });

  it("never shows a retired Theme, however many titles it holds, held or not", () => {
    expect(themeShown(retired, 0)).toBe(false);
    expect(themeShown(retired, 50)).toBe(false);
    expect(themeShown(retiredLaunch, 1)).toBe(false);
  });

  it("hides a retired Theme, takes its label off cards, and does not count it towards its shelf", () => {
    const cards = [card("a", "reading-scripture"), card("b", "reading-scripture"), card("c", "reading-scripture"), card("d", "rhythms-of-prayer")];
    const hidden = hiddenThemeIds([retired, faithB], cards);
    // Three titles on the retired Theme do not open the shelf for Rhythms of Prayer.
    expect(hidden).toEqual(new Set(["reading-scripture", "rhythms-of-prayer"]));
    expect(maskHiddenThemes(cards, hidden).every((c) => c.themeId === null && c.themeName === null)).toBe(true);
    expect(hiddenThemeIds([retiredLaunch], [card("x", "old-launch-theme")])).toEqual(new Set(["old-launch-theme"]));
  });

  it("leaves a retired Theme out of the /themes index even if a card still names it", () => {
    const themes = [
      { ...launch, name: "Chosen Habits", line: null, shelfName: "Personal Growth" },
      { ...retiredLaunch, name: "Old Launch Theme", line: null, shelfName: "Personal Growth" },
    ];
    const cards = [card("a", "chosen-habits"), card("b", "old-launch-theme")];
    expect(themeIndex(themes, cards)[0]?.themes.map((t) => t.id)).toEqual(["chosen-habits"]);
    expect(themeIndex(themes, maskHiddenThemes(cards, hiddenThemeIds(themes, cards)))[0]?.themes.map((t) => t.id)).toEqual(["chosen-habits"]);
  });
});
