import { describe, expect, it } from "vitest";
import {
  authorIndex,
  cardsByAuthor,
  cardsByCodes,
  cardsByTheme,
  countryName,
  findPublisher,
  isSlug,
  listPublishers,
  publisherForCode,
  publishersFrom,
  safeWebsite,
  themeIndex,
  workbookCount,
} from "./author-theme-pages";
import type { LibraryCard } from "./catalogue-types";

function card(over: Partial<LibraryCard> & Pick<LibraryCard, "id" | "title">): LibraryCard {
  return {
    code: "AK-00000",
    slug: over.id,
    shortTitle: null,
    cardLine: "",
    genreId: "business",
    genreName: "Business",
    themeId: null,
    themeName: null,
    badge: "official",
    isDemo: false,
    depth: "full",
    safetyTier: "none",
    authors: [],
    hasVersion: true,
    authorRefs: [],
    ...over,
  };
}

const ada = { slug: "ada-okafor", name: "Ada Okafor" };
const ben = { slug: "ben-hale", name: "Ben Hale" };

describe("slugs", () => {
  it("accepts database slugs and rejects anything else", () => {
    expect(isSlug("work-worth-choosing")).toBe(true);
    expect(isSlug("a1")).toBe(true);
    for (const bad of ["", "Work", "a--b", "-a", "a-", "a_b", "a b", "../x", "x".repeat(121)]) expect(isSlug(bad)).toBe(false);
    expect(isSlug(null)).toBe(false);
    expect(isSlug(undefined)).toBe(false);
  });
});

describe("narrowing cards", () => {
  const cards = [
    card({ id: "z", title: "Zinc", authorRefs: [ada], themeId: "money-matters", code: "AK-AAAAA" }),
    card({ id: "a", title: "Acorn", authorRefs: [ada, ben], themeId: "work", code: "AK-BBBBB" }),
    card({ id: "m", title: "Maple", authorRefs: [ben], themeId: "money-matters", code: "AK-CCCCC" }),
  ];

  it("finds an author's cards by slug, sorted by title", () => {
    expect(cardsByAuthor(cards, "ada-okafor").map((c) => c.id)).toEqual(["a", "z"]);
    expect(cardsByAuthor(cards, "nobody")).toEqual([]);
  });

  it("finds a Theme's cards by id, sorted by title", () => {
    expect(cardsByTheme(cards, "money-matters").map((c) => c.id)).toEqual(["m", "z"]);
    expect(cardsByTheme(cards, "none")).toEqual([]);
  });

  it("finds cards by AK- code", () => {
    expect(cardsByCodes(cards, new Set(["AK-CCCCC", "AK-AAAAA"])).map((c) => c.id)).toEqual(["m", "z"]);
  });

  it("builds an author index with counts and a demo flag", () => {
    const withDemo = [...cards, card({ id: "d", title: "Demo", authorRefs: [{ slug: "dee", name: "Dee Demo" }], isDemo: true, badge: "demo" })];
    expect(authorIndex(withDemo)).toEqual([
      { slug: "ada-okafor", name: "Ada Okafor", count: 2, isDemo: false },
      { slug: "ben-hale", name: "Ben Hale", count: 2, isDemo: false },
      { slug: "dee", name: "Dee Demo", count: 1, isDemo: true },
    ]);
  });

  it("marks an author demo only when every title is demo", () => {
    const mixed = [
      card({ id: "x", title: "X", authorRefs: [ada], isDemo: true, badge: "demo" }),
      card({ id: "y", title: "Y", authorRefs: [ada] }),
    ];
    expect(authorIndex(mixed)[0]?.isDemo).toBe(false);
  });
});

describe("theme index", () => {
  const themes = [
    { id: "work", name: "Work Worth Choosing", line: "Jobs.", shelfId: "work-and-career", shelfName: "Work and Career" },
    { id: "money-matters", name: "Money Matters", line: null, shelfId: "money", shelfName: "Money" },
    { id: "empty", name: "Empty Theme", line: null, shelfId: "money", shelfName: "Money" },
    { id: "loose", name: "Loose", line: null, shelfId: null, shelfName: null },
  ];
  const cards = [
    card({ id: "1", title: "One", themeId: "money-matters" }),
    card({ id: "2", title: "Two", themeId: "money-matters" }),
    card({ id: "3", title: "Three", themeId: "work" }),
    card({ id: "4", title: "Four", themeId: "loose" }),
    card({ id: "5", title: "Five", themeId: null }),
  ];

  it("keeps Themes with live cards, grouped by shelf name, unshelved last", () => {
    const out = themeIndex(themes, cards);
    expect(out.map((s) => s.shelfName)).toEqual(["Money", "Work and Career", null]);
    expect(out[0]?.themes.map((t) => [t.id, t.count])).toEqual([["money-matters", 2]]);
    expect(out[1]?.themes[0]?.line).toBe("Jobs.");
  });

  it("returns nothing when no card has a Theme", () => {
    expect(themeIndex(themes, [card({ id: "x", title: "X" })])).toEqual([]);
  });
});

describe("publishers", () => {
  const catalogue = {
    publishers: [
      { id: "PB-22222", slug: "zed-press", name: "Zed Press", city: "Leeds", country: "GB", is_demo: true },
      { id: "PB-11111", slug: "acorn-books", name: "Acorn Books", note: "A note." },
      { id: "PB-33333", slug: "Bad Slug", name: "Bad" },
    ],
    workbooks: [
      { code: "AK-AAAAA", publisher_id: "PB-11111" },
      { code: "AK-BBBBB", publisher_id: "PB-22222" },
      { code: "AK-CCCCC", publisher_id: null },
    ],
  };

  it("builds imprints sorted by name with their codes, dropping bad slugs", () => {
    const list = publishersFrom(catalogue);
    expect(list.map((p) => p.slug)).toEqual(["acorn-books", "zed-press"]);
    expect(list[0]).toMatchObject({ code: "PB-11111", note: "A note.", city: null, codes: ["AK-AAAAA"], isDemo: true });
    expect(list[1]).toMatchObject({ city: "Leeds", country: "GB", codes: ["AK-BBBBB"] });
  });

  it("finds an imprint by slug and by workbook code", () => {
    const list = publishersFrom(catalogue);
    expect(findPublisher("zed-press", list)?.name).toBe("Zed Press");
    expect(findPublisher("../zed-press", list)).toBeNull();
    expect(findPublisher("nobody", list)).toBeNull();
    expect(publisherForCode("AK-AAAAA", list)?.slug).toBe("acorn-books");
    expect(publisherForCode("AK-CCCCC", list)).toBeNull();
  });

  it("reads the demo catalogue's imprints, all labelled demo", () => {
    const list = listPublishers();
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) {
      expect(isSlug(p.slug)).toBe(true);
      expect(p.isDemo).toBe(true);
      expect(p.codes.length).toBeGreaterThan(0);
    }
  });
});

describe("display helpers", () => {
  it("counts workbooks in plain words", () => {
    expect(workbookCount(1)).toBe("1 workbook");
    expect(workbookCount(0)).toBe("0 workbooks");
    expect(workbookCount(7)).toBe("7 workbooks");
  });

  it("only passes http and https websites", () => {
    expect(safeWebsite("https://example.com/me")).toBe("https://example.com/me");
    expect(safeWebsite("http://example.com")).toBe("http://example.com/");
    expect(safeWebsite("javascript:alert(1)")).toBeNull();
    expect(safeWebsite("not a url")).toBeNull();
    expect(safeWebsite(null)).toBeNull();
  });

  it("names countries in English", () => {
    expect(countryName("GB")).toBe("United Kingdom");
    expect(countryName("ng")).toBe("Nigeria");
    expect(countryName(null)).toBeNull();
  });
});
