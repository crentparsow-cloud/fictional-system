import { describe, expect, it } from "vitest";
import { authorEntries, buildSearchIndex, collectionEntries, GROUP_LIMITS, groupResults, search, themeEntries, type SearchEntry } from "./search";

function entry(over: Partial<SearchEntry> & Pick<SearchEntry, "id" | "title" | "kind">): SearchEntry {
  return { href: `/x/${over.id}`, ...over };
}

describe("groupResults", () => {
  const results: SearchEntry[] = [
    entry({ id: "w1", kind: "workbook", title: "Calm Mornings" }),
    entry({ id: "a1", kind: "author", title: "Isla Calm" }),
    entry({ id: "t1", kind: "theme", title: "Calm Ground" }),
    entry({ id: "w2", kind: "workbook", title: "Calmer Evenings" }),
    entry({ id: "c1", kind: "collection", title: "Calm starts" }),
    entry({ id: "tool1", kind: "tool", title: "Calm breathing" }),
  ];

  it("splits into titles, authors, Themes and collections in that order, keeping rank inside a group", () => {
    const groups = groupResults(results);
    expect(groups.map((g) => g.id)).toEqual(["titles", "authors", "themes", "collections"]);
    expect(groups[0]?.results.map((r) => r.id)).toEqual(["w1", "w2", "tool1"]);
    expect(groups[1]?.results.map((r) => r.id)).toEqual(["a1"]);
  });

  it("leaves empty groups out", () => {
    expect(groupResults([entry({ id: "a1", kind: "author", title: "Isla" })]).map((g) => g.id)).toEqual(["authors"]);
    expect(groupResults([])).toEqual([]);
  });

  it("caps the small groups so a common word does not flood the page", () => {
    const many = Array.from({ length: 20 }, (_, i) => entry({ id: `a${i}`, kind: "author", title: `Author ${i}` }));
    const groups = groupResults(many);
    expect(groups[0]?.results).toHaveLength(GROUP_LIMITS.authors);
    expect(groups[0]?.results[0]?.id).toBe("a0");
  });
});

describe("entries for authors, Themes and collections", () => {
  it("makes one author entry per slug, linking to the author page", () => {
    const entries = authorEntries([
      { authorRefs: [{ slug: "isla-penrose", name: "Isla Penrose" }], isDemo: false },
      { authorRefs: [{ slug: "isla-penrose", name: "Isla Penrose" }, { slug: "mara-quill", name: "Mara Quill" }], isDemo: false },
      { isDemo: false },
    ]);
    expect(entries.map((e) => e.id)).toEqual(["isla-penrose", "mara-quill"]);
    expect(entries[0]).toMatchObject({ kind: "author", href: "/authors/isla-penrose", title: "Isla Penrose" });
  });

  it("leaves out a Theme with no visible title", () => {
    const themes = [
      { id: "steady-ground", name: "Steady Ground", line: "Calm." },
      { id: "empty-theme", name: "Empty" },
    ];
    expect(themeEntries(themes, [{ themeId: "steady-ground" }, { themeId: null }]).map((e) => e.id)).toEqual(["steady-ground"]);
    expect(themeEntries(themes).map((e) => e.id)).toEqual(["steady-ground", "empty-theme"]);
    expect(themeEntries(themes)[0]).toMatchObject({ kind: "theme", href: "/themes/steady-ground", line: "Calm." });
  });

  it("links collections by slug", () => {
    expect(collectionEntries([{ slug: "calm-starts", name: "Calm starts", line: "Gentle." }])[0]).toMatchObject({ kind: "collection", href: "/collections/calm-starts", title: "Calm starts" });
  });

  it("finds each kind by name through the ordinary search", () => {
    const index = buildSearchIndex([
      entry({ id: "w", kind: "workbook", title: "Meditations" }),
      ...authorEntries([{ authorRefs: [{ slug: "marcus-aurelius", name: "Marcus Aurelius" }], isDemo: false }]),
      ...themeEntries([{ id: "steady-ground", name: "Steady Ground" }]),
      ...collectionEntries([{ slug: "calm-starts", name: "Calm starts" }]),
    ]);
    expect(search(index, "aurelius").results.map((r) => r.kind)).toEqual(["author"]);
    expect(search(index, "steady").results.map((r) => r.kind)).toEqual(["theme"]);
    expect(search(index, "calm").results.map((r) => r.kind)).toEqual(["collection"]);
    expect(groupResults(search(index, "meditations").results).map((g) => g.id)).toEqual(["titles"]);
  });
});
