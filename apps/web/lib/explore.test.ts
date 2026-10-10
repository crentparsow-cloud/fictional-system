import { describe, expect, it } from "vitest";
import type { LibraryCard } from "./catalogue-types";
import {
  becauseYouRead,
  cardsOnShelf,
  featuredTitle,
  filterByLength,
  filterMine,
  finishRate,
  lengthBadge,
  lengthBucketOf,
  lengthOptions,
  MIN_STARTS_FOR_RATE,
  mineCounts,
  mostStarted,
  newThisWeek,
  parseMineFilter,
  parseMineSort,
  parseProgrammeLength,
  programmeWeeks,
  rankByEngagement,
  rankByStarts,
  relatedTitles,
  resolveCollections,
  shelfTiles,
  shortProgrammes,
  sortMine,
  statusChip,
  themesOnShelf,
  type CollectionRow,
  type MineRow,
  type Signals,
} from "./explore";

function card(over: Partial<LibraryCard> & Pick<LibraryCard, "id">): LibraryCard {
  return {
    code: "AK-00000",
    slug: over.id,
    title: over.id,
    shortTitle: null,
    cardLine: "",
    genreId: "wellbeing",
    genreName: "Wellbeing",
    themeId: null,
    themeName: null,
    badge: "official",
    isDemo: false,
    depth: "full",
    safetyTier: "none",
    authors: [],
    hasVersion: true,
    unitCount: null,
    unitKind: "week",
    ...over,
  };
}

const sig = (entries: Record<string, [number, number]>): Signals => new Map(Object.entries(entries).map(([id, [starts, finishes]]) => [id, { starts, finishes }]));

describe("ranking", () => {
  it("reads no finish rate until a title has enough starts", () => {
    expect(finishRate(undefined)).toBeNull();
    expect(finishRate({ starts: MIN_STARTS_FOR_RATE - 1, finishes: 9 })).toBeNull();
    expect(finishRate({ starts: 20, finishes: 5 })).toBe(0.25);
    expect(finishRate({ starts: 10, finishes: 30 })).toBe(1);
  });

  it("ranks by finish rate, not by opens", () => {
    const cards = [card({ id: "popular" }), card({ id: "finished" }), card({ id: "mid" })];
    const s = sig({ popular: [500, 50], finished: [20, 18], mid: [100, 40] });
    expect(rankByEngagement(cards, s).map((c) => c.id)).toEqual(["finished", "mid", "popular"]);
  });

  it("puts titles with a usable rate before titles without one, then falls back to starts", () => {
    const cards = [card({ id: "new-a" }), card({ id: "few" }), card({ id: "rated" }), card({ id: "none" })];
    const s = sig({ "new-a": [3, 3], few: [8, 1], rated: [40, 4] });
    expect(rankByEngagement(cards, s).map((c) => c.id)).toEqual(["rated", "few", "new-a", "none"]);
  });

  it("breaks ties on starts then title, and does not change its input", () => {
    const cards = [card({ id: "b" }), card({ id: "a" }), card({ id: "c" })];
    const s = sig({ a: [10, 5], b: [10, 5], c: [20, 10] });
    expect(rankByEngagement(cards, s).map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(cards.map((c) => c.id)).toEqual(["b", "a", "c"]);
  });

  it("ranks Most started on starts alone and leaves out titles nobody started", () => {
    const cards = [card({ id: "a" }), card({ id: "b" }), card({ id: "c" })];
    const s = sig({ a: [5, 5], b: [50, 1] });
    expect(rankByStarts(cards, s).map((c) => c.id)).toEqual(["b", "a"]);
    expect(mostStarted(cards, s, 1).map((c) => c.id)).toEqual(["b"]);
    expect(mostStarted(cards, new Map())).toEqual([]);
  });
});

describe("programme length", () => {
  it("counts weeks from the programme data", () => {
    expect(programmeWeeks(card({ id: "a", unitCount: 4 }))).toBe(4);
    expect(programmeWeeks(card({ id: "a", unitCount: 21, unitKind: "day" }))).toBe(3);
    expect(programmeWeeks(card({ id: "a", unitCount: 15, unitKind: "day" }))).toBe(3);
    expect(programmeWeeks(card({ id: "a", unitCount: 6, unitKind: "module" }))).toBeNull();
    expect(programmeWeeks(card({ id: "a", unitCount: null }))).toBeNull();
    expect(programmeWeeks(card({ id: "a", unitCount: 0 }))).toBeNull();
  });

  it("buckets at 4, 8 and longer", () => {
    expect([1, 4, 5, 8, 9, 12, 20].map(lengthBucketOf)).toEqual(["4", "4", "8", "8", "12", "12", "12"]);
  });

  it("writes the badge from the data", () => {
    expect(lengthBadge(card({ id: "a", unitCount: 4 }))).toBe("4 weeks");
    expect(lengthBadge(card({ id: "a", unitCount: 12 }))).toBe("12 weeks");
    expect(lengthBadge(card({ id: "a", unitCount: 1 }))).toBe("1 week");
    expect(lengthBadge(card({ id: "a", unitCount: 10, unitKind: "day" }))).toBe("10 days");
    expect(lengthBadge(card({ id: "a", unitCount: 6, unitKind: "module" }))).toBe("6 modules");
    expect(lengthBadge(card({ id: "a", unitCount: 5, unitKind: null }))).toBe("5 weeks");
    expect(lengthBadge(card({ id: "a", unitCount: null }))).toBeNull();
  });

  it("filters by bucket and offers only buckets that hold a title", () => {
    const cards = [card({ id: "a", unitCount: 4 }), card({ id: "b", unitCount: 8 }), card({ id: "c", unitCount: 12 }), card({ id: "d" })];
    expect(filterByLength(cards, "4").map((c) => c.id)).toEqual(["a"]);
    expect(filterByLength(cards, "8").map((c) => c.id)).toEqual(["b"]);
    expect(filterByLength(cards, "12").map((c) => c.id)).toEqual(["c"]);
    expect(filterByLength(cards, undefined)).toHaveLength(4);
    expect(lengthOptions(cards.slice(0, 2))).toEqual(["4", "8"]);
  });

  it("accepts only the three lengths from the URL", () => {
    expect(parseProgrammeLength("8")).toBe("8");
    expect(parseProgrammeLength(["12", "4"])).toBe("12");
    expect(parseProgrammeLength("6")).toBeUndefined();
    expect(parseProgrammeLength(undefined)).toBeUndefined();
  });
});

describe("rails", () => {
  const now = new Date("2026-10-10T12:00:00Z");

  it("shows only the last seven days, newest first", () => {
    const cards = [
      card({ id: "old", addedAt: "2026-09-01T00:00:00Z" }),
      card({ id: "mid", addedAt: "2026-10-05T00:00:00Z" }),
      card({ id: "fresh", addedAt: "2026-10-09T00:00:00Z" }),
      card({ id: "future", addedAt: "2026-10-20T00:00:00Z" }),
      card({ id: "undated" }),
    ];
    expect(newThisWeek(cards, now).map((c) => c.id)).toEqual(["fresh", "mid"]);
    expect(newThisWeek(cards, now, 1).map((c) => c.id)).toEqual(["fresh"]);
  });

  it("keeps Short programmes to four weeks or fewer, ranked by finish rate", () => {
    const cards = [
      card({ id: "long", unitCount: 12 }),
      card({ id: "four-a", unitCount: 4 }),
      card({ id: "four-b", unitCount: 4 }),
      card({ id: "days", unitCount: 14, unitKind: "day" }),
      card({ id: "five", unitCount: 5 }),
    ];
    const s = sig({ "four-a": [50, 10], "four-b": [50, 40], days: [12, 6] });
    expect(shortProgrammes(cards, s).map((c) => c.id)).toEqual(["four-b", "days", "four-a"]);
  });

  describe("Because you read X", () => {
    const shelfOfTheme = new Map([
      ["calm", "mind"],
      ["focus", "mind"],
      ["pay", "money"],
    ]);
    const cards = [
      card({ id: "read", themeId: "calm" }),
      card({ id: "same-theme", themeId: "calm" }),
      card({ id: "same-shelf", themeId: "focus" }),
      card({ id: "other", themeId: "pay" }),
      card({ id: "alone", themeId: "pay" }),
    ];
    const seed = (workbookId: string, status: "active" | "finished" | "paused", lastOpenedAt: string) => ({ workbookId, status, lastOpenedAt });

    it("lists the same Theme first, without titles the reader already has", () => {
      const r = becauseYouRead(cards, [seed("read", "active", "2026-10-01T00:00:00Z")], shelfOfTheme, new Map());
      expect(r?.seed.id).toBe("read");
      expect(r?.basis).toBe("theme");
      expect(r?.cards.map((c) => c.id)).toEqual(["same-theme"]);
    });

    it("falls back to the same shelf when the Theme holds nothing else", () => {
      const r = becauseYouRead(cards.filter((c) => c.id !== "same-theme"), [seed("read", "active", "2026-10-01T00:00:00Z")], shelfOfTheme, new Map());
      expect(r?.basis).toBe("shelf");
      expect(r?.cards.map((c) => c.id)).toEqual(["same-shelf"]);
    });

    it("prefers a finished title as the seed, then the latest opened", () => {
      const seeds = [seed("read", "active", "2026-10-09T00:00:00Z"), seed("alone", "finished", "2026-09-01T00:00:00Z")];
      expect(becauseYouRead(cards, seeds, shelfOfTheme, new Map())?.seed.id).toBe("alone");
    });

    it("is null with no enrolments, no live seed or nothing to suggest", () => {
      expect(becauseYouRead(cards, [], shelfOfTheme, new Map())).toBeNull();
      expect(becauseYouRead(cards, [seed("gone", "active", "2026-10-01T00:00:00Z")], shelfOfTheme, new Map())).toBeNull();
      expect(becauseYouRead([cards[0]!], [seed("read", "active", "2026-10-01T00:00:00Z")], shelfOfTheme, new Map())).toBeNull();
    });
  });
});

describe("shelves", () => {
  const shelfOfTheme = new Map([
    ["calm", "mind"],
    ["pay", "money"],
  ]);
  const cards = [card({ id: "a", themeId: "calm" }), card({ id: "b", themeId: "calm" }), card({ id: "c", themeId: "pay" }), card({ id: "loose" })];
  const shelves = [
    { id: "money", name: "Money", status: "active", sort: 2 },
    { id: "mind", name: "Mind", status: "active", sort: 1 },
    { id: "gone", name: "Gone", status: "retired", sort: 0 },
    { id: "held", name: "Held", status: "proposed", sort: 3, held: true },
    { id: "empty", name: "Empty", status: "proposed", sort: 4 },
  ];

  it("counts live titles through the Theme and leaves out retired and empty held shelves", () => {
    expect(shelfTiles(shelves, cards, shelfOfTheme)).toEqual([
      { id: "mind", name: "Mind", count: 2 },
      { id: "money", name: "Money", count: 1 },
      { id: "empty", name: "Empty", count: 0 },
    ]);
    expect(cardsOnShelf(cards, "mind", shelfOfTheme).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("features the staff choice while it is on the shelf, else the best ranked", () => {
    const onShelf = cardsOnShelf(cards, "mind", shelfOfTheme);
    const s = sig({ a: [30, 3], b: [30, 20] });
    expect(featuredTitle(onShelf, "a", s)?.id).toBe("a");
    expect(featuredTitle(onShelf, "c", s)?.id).toBe("b");
    expect(featuredTitle(onShelf, null, s)?.id).toBe("b");
    expect(featuredTitle([], "a", s)).toBeNull();
  });

  it("lists Themes that hold a title on the shelf", () => {
    const themes = [
      { id: "calm", name: "Calm", line: null, shelfId: "mind" },
      { id: "focus", name: "Focus", line: null, shelfId: "mind" },
      { id: "pay", name: "Pay", line: null, shelfId: "money" },
    ];
    expect(themesOnShelf(themes, cardsOnShelf(cards, "mind", shelfOfTheme), "mind").map((t) => [t.id, t.count])).toEqual([["calm", 2]]);
  });
});

describe("collections", () => {
  const cards = [card({ id: "a" }), card({ id: "b" }), card({ id: "c" }), card({ id: "d" })];
  const row = (over: Partial<CollectionRow> & Pick<CollectionRow, "slug" | "items">): CollectionRow => ({
    id: over.slug,
    name: over.slug,
    line: "",
    coverGenre: "wellbeing",
    coverPattern: null,
    sort: 0,
    ...over,
  });
  const items = (...ids: string[]) => ids.map((workbookId, i) => ({ workbookId, position: i + 1 }));

  it("keeps staff order, whatever order the rows came back in", () => {
    const shuffled = [
      { workbookId: "c", position: 3 },
      { workbookId: "a", position: 1 },
      { workbookId: "b", position: 2 },
    ];
    const [c] = resolveCollections([row({ slug: "x", items: shuffled })], cards);
    expect(c?.cards.map((k) => k.id)).toEqual(["a", "b", "c"]);
  });

  it("drops titles that are not visible, and the collection when too few are left", () => {
    const out = resolveCollections(
      [row({ slug: "kept", items: items("a", "gone", "b", "c") }), row({ slug: "thin", items: items("a", "gone", "gone-too", "b") })],
      cards,
    );
    expect(out.map((c) => c.slug)).toEqual(["kept"]);
    expect(out[0]?.cards.map((k) => k.id)).toEqual(["a", "b", "c"]);
    expect(resolveCollections([row({ slug: "thin", items: items("a", "b") })], cards, 2)).toHaveLength(1);
  });

  it("orders collections by set order then name and carries the cover fields", () => {
    const out = resolveCollections(
      [
        row({ slug: "z", name: "Zed", sort: 1, items: items("a", "b", "c") }),
        row({ slug: "m", name: "Mid", sort: 0, coverPattern: "dots", items: items("a", "b", "c") }),
        row({ slug: "a", name: "Able", sort: 1, items: items("a", "b", "c") }),
      ],
      cards,
    );
    expect(out.map((c) => c.slug)).toEqual(["m", "a", "z"]);
    expect(out[0]).toMatchObject({ coverGenre: "wellbeing", coverPattern: "dots" });
    expect("items" in out[0]!).toBe(false);
  });
});

describe("related titles", () => {
  const me = card({ id: "me", themeId: "calm", unitCount: 4, authorRefs: [{ slug: "ana", name: "Ana" }] });

  it("never includes the title itself and caps at six", () => {
    const pool = [me, ...Array.from({ length: 9 }, (_, i) => card({ id: `t${i}`, themeId: "calm" }))];
    const out = relatedTitles(me, pool);
    expect(out).toHaveLength(6);
    expect(out.some((c) => c.id === "me")).toBe(false);
  });

  it("ranks Theme over author over length, and sums matches", () => {
    const pool = [
      card({ id: "length-only", unitCount: 3 }),
      card({ id: "author-only", authorRefs: [{ slug: "ana", name: "Ana" }] }),
      card({ id: "theme-only", themeId: "calm" }),
      card({ id: "theme-and-length", themeId: "calm", unitCount: 2 }),
      card({ id: "unrelated", themeId: "other", unitCount: 12 }),
    ];
    expect(relatedTitles(me, pool).map((c) => c.id)).toEqual(["theme-and-length", "theme-only", "author-only", "length-only"]);
  });

  it("matches on length alone when the title has no Theme or author", () => {
    const bare = card({ id: "bare", unitCount: 8 });
    const pool = [card({ id: "eight", unitCount: 6 }), card({ id: "twelve", unitCount: 12 }), card({ id: "unknown" })];
    expect(relatedTitles(bare, pool).map((c) => c.id)).toEqual(["eight"]);
  });
});

describe("My workbooks", () => {
  const row = (over: Partial<MineRow> & Pick<MineRow, "enrolmentId">): MineRow => ({
    workbookId: over.enrolmentId,
    slug: over.enrolmentId,
    code: "AK-00000",
    title: over.enrolmentId,
    shortTitle: null,
    badge: "official",
    isDemo: false,
    safetyTier: "none",
    status: "active",
    startedAt: "2026-09-01T00:00:00Z",
    lastOpenedAt: "2026-10-01T00:00:00Z",
    unitCount: null,
    unitKind: null,
    authors: [],
    ...over,
  });
  const rows = [
    row({ enrolmentId: "b", title: "Bravo", status: "active", lastOpenedAt: "2026-10-05T00:00:00Z" }),
    row({ enrolmentId: "a", title: "Alpha", status: "finished", lastOpenedAt: "2026-09-20T00:00:00Z" }),
    row({ enrolmentId: "c", title: "Charlie", status: "paused", lastOpenedAt: "2026-10-09T00:00:00Z" }),
  ];

  it("names the chips reading, finished and paused", () => {
    expect([statusChip("active"), statusChip("finished"), statusChip("paused")]).toEqual(["reading", "finished", "paused"]);
  });

  it("filters All, Reading and Finished; paused shows under All only", () => {
    expect(filterMine(rows, "all")).toHaveLength(3);
    expect(filterMine(rows, "reading").map((r) => r.enrolmentId)).toEqual(["b"]);
    expect(filterMine(rows, "finished").map((r) => r.enrolmentId)).toEqual(["a"]);
    expect(mineCounts(rows)).toEqual({ all: 3, reading: 1, finished: 1 });
  });

  it("sorts by last opened, newest first, or by title", () => {
    expect(sortMine(rows, "opened").map((r) => r.enrolmentId)).toEqual(["c", "b", "a"]);
    expect(sortMine(rows, "title").map((r) => r.title)).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(rows.map((r) => r.enrolmentId)).toEqual(["b", "a", "c"]);
  });

  it("falls back to All and Last opened for anything else in the URL", () => {
    expect(parseMineFilter("finished")).toBe("finished");
    expect(parseMineFilter("paused")).toBe("all");
    expect(parseMineFilter(undefined)).toBe("all");
    expect(parseMineSort("title")).toBe("title");
    expect(parseMineSort("random")).toBe("opened");
  });
});
