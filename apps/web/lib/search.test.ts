import { describe, expect, it } from "vitest";
import type { LibraryCard } from "./catalogue-types";
import { translator } from "./locale";
import { buildSearchIndex, cleanTopics, entryFromCard, MAX_RESULTS, scoreEntry, search, searchLabels, searchStatus, wordScore, type SearchEntry } from "./search";
import { normaliseQuery } from "./search-safety";

function entry(over: Partial<SearchEntry> & Pick<SearchEntry, "id" | "title">): SearchEntry {
  return { kind: "workbook", href: `/w/${over.id}`, authors: [], topics: [], ...over };
}

const ENTRIES: SearchEntry[] = [
  entry({ id: "calm", title: "The Calm Within", authors: ["Isla Penrose-Gale"], themeName: "Steady Ground", genreName: "Wellbeing", code: "AK-00001", line: "Small steps for busy evenings.", topics: ["worry", "stress"] }),
  entry({ id: "money", title: "Money for Later", authors: ["Tobias Ferrand"], themeName: "Considered Spending", genreName: "Money", code: "AK-00002", publisher: "Northgate Press", line: "Saving habits, one week at a time." }),
  entry({ id: "habits", title: "Chosen Habits", authors: ["Mara Quill"], themeName: "Habits and Character", genreName: "Personal Growth", code: "AK-00003" }),
  entry({ id: "meditations", title: "Meditations", authors: ["Marcus Aurelius"], themeName: "Steady Ground", genreName: "Classics", code: "AK-00004", badge: "public_domain" }),
  entry({ id: "calmer", title: "Calmer Mornings", authors: ["Isla Penrose-Gale"], themeName: "Steady Ground", genreName: "Wellbeing", code: "AK-00005" }),
];

const INDEX = buildSearchIndex(ENTRIES);
const ids = (q: string) => search(INDEX, q).results.map((r) => r.id);

describe("buildSearchIndex", () => {
  it("normalises every field once and keeps the entry", () => {
    const first = INDEX[0]!;
    expect(first.entry.id).toBe("calm");
    expect(first.fields.title).toBe(" the calm within ");
    expect(first.fields.code).toBe(" ak 00001 ");
    expect(first.fields.topics).toContain("worry");
  });

  it("drops duplicate ids of the same kind and keeps the first", () => {
    const idx = buildSearchIndex([entry({ id: "a", title: "One" }), entry({ id: "a", title: "Two" }), entry({ id: "a", title: "Tool", kind: "tool" })]);
    expect(idx.map((i) => i.entry.title)).toEqual(["One", "Tool"]);
  });

  it("copes with missing optional fields", () => {
    const idx = buildSearchIndex([{ id: "x", kind: "workbook", href: "/w/x", title: "Bare" }]);
    expect(search(idx, "bare").results).toHaveLength(1);
  });
});

describe("wordScore", () => {
  it("ranks whole word over word start over inside a word", () => {
    expect(wordScore("calm", " the calm within ")).toBe(3);
    expect(wordScore("cal", " the calm within ")).toBe(2);
    expect(wordScore("alm", " the calm within ")).toBe(1);
    expect(wordScore("zz", " the calm within ")).toBe(0);
  });

  it("does not match inside a word for one or two letters", () => {
    expect(wordScore("al", " the calm within ")).toBe(0);
  });

  it("is 0 for an empty word or field", () => {
    expect(wordScore("", " calm ")).toBe(0);
    expect(wordScore("calm", "  ")).toBe(0);
  });
});

describe("search", () => {
  it("returns nothing and no Help now for an empty query", () => {
    expect(search(INDEX, "")).toEqual({ helpNow: false, results: [], active: false });
    expect(search(INDEX, "   ").active).toBe(false);
  });

  it("matches on title, author, Theme, shelf, code, publisher, line and hidden topics", () => {
    expect(ids("chosen")).toEqual(["habits"]);
    expect(ids("aurelius")).toEqual(["meditations"]);
    expect(ids("considered spending")).toEqual(["money"]);
    expect(ids("classics")).toEqual(["meditations"]);
    expect(ids("AK-00003")).toEqual(["habits"]);
    expect(ids("ak00003")).toEqual([]);
    expect(ids("northgate")).toEqual(["money"]);
    expect(ids("busy evenings")).toEqual(["calm"]);
    expect(ids("worry")).toEqual(["calm"]);
  });

  it("is case, accent and punctuation blind", () => {
    expect(ids("MÉDITATIONS!")).toEqual(["meditations"]);
    expect(ids("penrose gale")).toEqual(expect.arrayContaining(["calm", "calmer"]));
  });

  it("needs every word to match", () => {
    expect(ids("calm money")).toEqual([]);
    expect(ids("isla mornings")).toEqual(["calmer"]);
  });

  it("matches word starts as the reader types", () => {
    expect(ids("medit")).toEqual(["meditations"]);
    expect(ids("calm")).toEqual(expect.arrayContaining(["calm", "calmer"]));
  });

  it("ranks a title match above a Theme or topic match", () => {
    const idx = buildSearchIndex([
      entry({ id: "topic", title: "Zed", topics: ["steady"] }),
      entry({ id: "theme", title: "Yak", themeName: "Steady Ground" }),
      entry({ id: "title", title: "Steady Steps" }),
    ]);
    expect(search(idx, "steady").results.map((r) => r.id)).toEqual(["title", "theme", "topic"]);
  });

  it("puts an exact or leading title match first", () => {
    expect(ids("calmer")[0]).toBe("calmer");
    expect(ids("the calm within")[0]).toBe("calm");
  });

  it("breaks ties by title", () => {
    const idx = buildSearchIndex([entry({ id: "b", title: "Bravo", themeName: "Same" }), entry({ id: "a", title: "Alpha", themeName: "Same" })]);
    expect(search(idx, "same").results.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("caps the number of results", () => {
    const many = buildSearchIndex(Array.from({ length: 80 }, (_, i) => entry({ id: `w${i}`, title: `Workbook ${i}` })));
    expect(search(many, "workbook").results).toHaveLength(MAX_RESULTS);
    expect(search(many, "workbook", 5).results).toHaveLength(5);
  });

  it("does not show Help now for ordinary queries", () => {
    for (const q of ["calm", "money", "habits", "AK-00001", "marcus", "steady ground", "worry", "sleep"]) {
      expect(search(INDEX, q).helpNow, q).toBe(false);
    }
  });
});

describe("Help now first", () => {
  const crisis = ["I want to die", "suicidal", "self harm", "kill myself", "I can't go on", "abuse", "I'm in danger", "overdose"];

  it("flags crisis queries even when no workbook matches", () => {
    for (const q of crisis) {
      const out = search(INDEX, q);
      expect(out.helpNow, q).toBe(true);
      expect(out.active, q).toBe(true);
    }
    expect(search(INDEX, "I want to die").results).toEqual([]);
  });

  it("keeps Help now when the query also matches workbooks", () => {
    // A topic term shared with a crisis word must not push the card down or away.
    const idx = buildSearchIndex([entry({ id: "w", title: "Steady After Harm", topics: ["self harm"] })]);
    const out = search(idx, "self harm");
    expect(out.helpNow).toBe(true);
    expect(out.results.map((r) => r.id)).toEqual(["w"]);
  });

  it("does not depend on the index: an empty catalogue still shows Help now", () => {
    expect(search(buildSearchIndex([]), "suicide")).toEqual({ helpNow: true, results: [], active: true });
  });
});

describe("searchStatus", () => {
  const labels = { countNone: "No workbooks match.", countOne: "1 workbook found.", count: "{count} workbooks found.", helpFirst: "Help now is shown first." };

  it("is empty before anything is typed", () => {
    expect(searchStatus(search(INDEX, ""), labels)).toBe("");
  });

  it("gives the count", () => {
    expect(searchStatus(search(INDEX, "zzzz"), labels)).toBe("No workbooks match.");
    expect(searchStatus(search(INDEX, "chosen"), labels)).toBe("1 workbook found.");
    expect(searchStatus(search(INDEX, "steady"), labels)).toBe("3 workbooks found.");
  });

  it("says Help now comes first on a crisis query", () => {
    expect(searchStatus(search(INDEX, "suicide"), labels)).toBe("Help now is shown first. No workbooks match.");
  });
});

describe("searchLabels", () => {
  it("fills every label from the message set with no em dashes", () => {
    for (const locale of ["en-GB", "en-US"] as const) {
      const labels = searchLabels(translator(locale));
      for (const [key, value] of Object.entries(labels)) {
        expect(value, key).not.toMatch(/^search\./);
        expect(value, key).not.toContain("—");
      }
      expect(labels.count).toContain("{count}");
      expect(labels.helpBody).toBe("If you need help now, you are not alone. Help now has people you can talk to today.");
    }
  });
});

describe("entryFromCard and cleanTopics", () => {
  const card: LibraryCard = {
    id: "id-1",
    code: "AK-00009",
    slug: "steady-steps",
    title: "Steady Steps",
    shortTitle: "Steps",
    cardLine: "A line.",
    genreId: "wellbeing",
    genreName: "Wellbeing",
    themeId: "steady-ground",
    themeName: "Steady Ground",
    badge: "demo",
    isDemo: true,
    depth: "full",
    safetyTier: "standard",
    authors: ["Isla Penrose-Gale"],
    hasVersion: true,
  };

  it("maps a library card to a workbook entry", () => {
    const e = entryFromCard(card, { topics: ["worry"], publisher: "Northgate Press" });
    expect(e).toMatchObject({ id: "id-1", kind: "workbook", href: "/w/steady-steps", title: "Steady Steps", code: "AK-00009", topics: ["worry"], publisher: "Northgate Press", badge: "demo", isDemo: true });
  });

  it("defaults the extras", () => {
    const e = entryFromCard(card);
    expect(e.topics).toEqual([]);
    expect(e.publisher).toBeNull();
  });

  it("keeps only short strings from the topic column", () => {
    expect(cleanTopics(null)).toEqual([]);
    expect(cleanTopics("worry")).toEqual([]);
    expect(cleanTopics([" worry ", 3, "", "x".repeat(100)])).toEqual(["worry", "x".repeat(60)]);
    expect(cleanTopics(Array.from({ length: 60 }, (_, i) => `t${i}`))).toHaveLength(40);
  });
});

describe("scoreEntry", () => {
  it("is 0 when any word fails", () => {
    const first = INDEX[0]!;
    expect(scoreEntry(first, normaliseQuery("calm zebra"))).toBe(0);
    expect(scoreEntry(first, normaliseQuery("calm"))).toBeGreaterThan(0);
  });
});
