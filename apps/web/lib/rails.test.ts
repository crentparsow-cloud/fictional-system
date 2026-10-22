import { describe, expect, it } from "vitest";
import type { LibraryCard } from "./catalogue-types";
import { MAX_PERSONAL_RAILS, personalRails, railHeadingMessage, railScore, rankByRailScore, type RailContext, type RailSignals } from "./rails";

function card(over: Partial<LibraryCard> & Pick<LibraryCard, "id">): LibraryCard {
  return {
    code: "AK-00000",
    slug: over.id,
    title: over.id,
    shortTitle: null,
    cardLine: "",
    genreId: "personal_development",
    genreName: "Personal development",
    themeId: null,
    themeName: null,
    badge: "official",
    isDemo: false,
    depth: "full",
    safetyTier: "none",
    authors: [],
    hasVersion: true,
    unitCount: 8,
    unitKind: "week",
    ...over,
  };
}

const sig = (o: Record<string, [number, number, number]>): RailSignals => new Map(Object.entries(o).map(([id, [starts, finishes, returned]]) => [id, { starts, finishes, returned }]));

describe("railScore", () => {
  it("is null while a title has too few starts", () => {
    expect(railScore(undefined)).toBeNull();
    expect(railScore({ starts: 9, finishes: 9, returned: 9 })).toBeNull();
  });

  it("weighs finishing at 60 percent and coming back at 40 percent", () => {
    expect(railScore({ starts: 10, finishes: 10, returned: 10 })).toBeCloseTo(1);
    expect(railScore({ starts: 10, finishes: 10, returned: 0 })).toBeCloseTo(0.6);
    expect(railScore({ starts: 10, finishes: 0, returned: 10 })).toBeCloseTo(0.4);
    expect(railScore({ starts: 20, finishes: 5, returned: 10 })).toBeCloseTo(0.6 * 0.25 + 0.4 * 0.5);
  });

  it("keeps odd counts inside 0 to 1", () => {
    expect(railScore({ starts: 10, finishes: 99, returned: 99 })).toBeCloseTo(1);
    expect(railScore({ starts: 10, finishes: -4, returned: -4 })).toBeCloseTo(0);
  });
});

describe("rankByRailScore", () => {
  it("puts a usable score first, then starts, then title", () => {
    const cards = [card({ id: "b" }), card({ id: "a" }), card({ id: "scored" }), card({ id: "busy" })];
    const signals = sig({ scored: [20, 10, 8], busy: [5, 5, 5], a: [1, 0, 0] });
    expect(rankByRailScore(cards, signals).map((c) => c.id)).toEqual(["scored", "busy", "a", "b"]);
  });

  it("ranks a title that readers come back to above one they only finish", () => {
    const cards = [card({ id: "finish" }), card({ id: "stick" })];
    const signals = sig({ finish: [20, 10, 0], stick: [20, 10, 10] });
    expect(rankByRailScore(cards, signals).map((c) => c.id)).toEqual(["stick", "finish"]);
  });
});

function ctx(over: Partial<RailContext> = {}): RailContext {
  const cards = [
    card({ id: "read", themeId: "t1", themeName: "Steady Ground", unitCount: 8 }),
    card({ id: "t1a", themeId: "t1", themeName: "Steady Ground" }),
    card({ id: "t1b", themeId: "t1", themeName: "Steady Ground" }),
    card({ id: "t2a", themeId: "t2", themeName: "Money Matters", authorRefs: [{ slug: "mara-quill", name: "Mara Quill" }] }),
    card({ id: "t2b", themeId: "t2", themeName: "Money Matters" }),
    card({ id: "short1", themeId: "t3", themeName: "Quick Wins", unitCount: 4 }),
    card({ id: "short2", themeId: "t3", themeName: "Quick Wins", unitCount: 3 }),
  ];
  return {
    cards,
    signals: sig({ t1a: [20, 12, 10], t1b: [20, 4, 2] }),
    seeds: [{ workbookId: "read", status: "finished", lastOpenedAt: "2026-10-10T10:00:00Z" }],
    followedAuthors: new Set(),
    shelfOfTheme: new Map([["t1", "s1"], ["t2", "s1"], ["t3", "s2"]]),
    shelves: [{ id: "s1", name: "Calm and Focus" }, { id: "s2", name: "Quick Reads" }],
    ...over,
  };
}

describe("personalRails", () => {
  it("gives a reader with nothing to go on no rails", () => {
    expect(personalRails(ctx({ seeds: [] }))).toEqual([]);
  });

  it("offers more in the same Theme, best first, never a title the reader has", () => {
    const rails = personalRails(ctx());
    const theme = rails.find((r) => r.rule === "same_theme");
    expect(theme?.heading).toEqual({ key: "theme", name: "Steady Ground" });
    expect(theme?.cards.map((c) => c.id)).toEqual(["t1a", "t1b"]);
    expect(rails.flatMap((r) => r.cards).map((c) => c.id)).not.toContain("read");
  });

  it("then the same shelf, without repeating a card already shown", () => {
    const rails = personalRails(ctx());
    const shelf = rails.find((r) => r.rule === "same_shelf");
    expect(shelf?.heading).toEqual({ key: "shelf", name: "Calm and Focus" });
    expect(shelf?.cards.map((c) => c.id)).toEqual(["t2a", "t2b"]);
    const all = rails.flatMap((r) => r.cards.map((c) => c.id));
    expect(new Set(all).size).toBe(all.length);
  });

  it("offers short programmes after a finished title", () => {
    const rails = personalRails(ctx());
    expect(rails.find((r) => r.rule === "short_follow_on")?.cards.map((c) => c.id).sort()).toEqual(["short1", "short2"]);
    const active = personalRails(ctx({ seeds: [{ workbookId: "read", status: "active", lastOpenedAt: "2026-10-10T10:00:00Z" }] }));
    expect(active.find((r) => r.rule === "short_follow_on")).toBeUndefined();
  });

  it("puts titles by followed authors first, even with a single card, and names no author in the heading", () => {
    const rails = personalRails(ctx({ followedAuthors: new Set(["mara-quill"]) }));
    expect(rails[0]?.rule).toBe("followed_authors");
    expect(rails[0]?.cards.map((c) => c.id)).toEqual(["t2a"]);
    expect(rails[0]?.heading).toEqual({ key: "followed" });
  });

  it("works for a reader who only follows an author", () => {
    const rails = personalRails(ctx({ seeds: [], followedAuthors: new Set(["mara-quill"]) }));
    expect(rails.map((r) => r.rule)).toEqual(["followed_authors"]);
  });

  it("skips a rail with fewer than two cards", () => {
    const small = ctx({ cards: [card({ id: "read", themeId: "t1", themeName: "Steady Ground" }), card({ id: "only", themeId: "t1", themeName: "Steady Ground" })] });
    expect(personalRails(small).find((r) => r.rule === "same_theme")).toBeUndefined();
  });

  it("never exceeds the rail limit and caps each rail", () => {
    const rails = personalRails(ctx({ limit: 1 }));
    expect(rails.length).toBeLessThanOrEqual(MAX_PERSONAL_RAILS);
    for (const r of rails) expect(r.cards.length).toBeLessThanOrEqual(1);
  });

  it("is the same every time for the same input", () => {
    expect(personalRails(ctx())).toEqual(personalRails(ctx()));
  });
});

describe("railHeadingMessage", () => {
  it("maps each heading to a message key", () => {
    expect(railHeadingMessage({ key: "followed" })).toEqual({ key: "rails.followed" });
    expect(railHeadingMessage({ key: "theme", name: "X" })).toEqual({ key: "rails.theme", values: { name: "X" } });
    expect(railHeadingMessage({ key: "shelf", name: "Y" })).toEqual({ key: "rails.shelf", values: { name: "Y" } });
    expect(railHeadingMessage({ key: "short" })).toEqual({ key: "rails.short" });
  });
});
