import { describe, expect, it } from "vitest";
import { fetchCollectionBySlug, fetchLiveCollections } from "./collections-query";

type Call = { table: string; select: string; eq: [string, unknown][]; order: string[]; slugLookup: boolean };

/** A stub of the parts of the Supabase client the query uses, recording what was asked. */
function stub(rows: unknown[], error: { message: string } | null = null) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, select: "", eq: [], order: [], slugLookup: false };
      calls.push(call);
      const chain = {
        select(cols: string) {
          call.select = cols;
          return chain;
        },
        eq(col: string, val: unknown) {
          call.eq.push([col, val]);
          return chain;
        },
        order(col: string) {
          call.order.push(col);
          return chain;
        },
        limit: () => Promise.resolve({ data: rows, error }),
        maybeSingle() {
          call.slugLookup = true;
          return Promise.resolve({ data: rows[0] ?? null, error });
        },
      };
      return chain;
    },
  };
  return { db: db as never, calls };
}

const raw = {
  id: "c1",
  slug: "calm-starts",
  name: "Calm starts",
  line: "Gentle first steps.",
  cover_genre: "wellbeing",
  cover_pattern: "waves",
  sort: 2,
  collection_items: [
    { workbook_id: "w2", position: 2 },
    { workbook_id: "w1", position: 1 },
  ],
};

describe("collections query", () => {
  it("asks for live collections in set order with named columns", async () => {
    const { db, calls } = stub([raw]);
    const out = await fetchLiveCollections(db);
    expect(calls[0]?.table).toBe("collections");
    expect(calls[0]?.select).not.toContain("*");
    expect(calls[0]?.eq).toEqual([["status", "live"]]);
    expect(calls[0]?.order).toEqual(["sort", "name"]);
    expect(out).toEqual([
      {
        id: "c1",
        slug: "calm-starts",
        name: "Calm starts",
        line: "Gentle first steps.",
        coverGenre: "wellbeing",
        coverPattern: "waves",
        sort: 2,
        items: [
          { workbookId: "w2", position: 2 },
          { workbookId: "w1", position: 1 },
        ],
      },
    ]);
  });

  it("treats a collection with no items as an empty list, not an error", async () => {
    const { db } = stub([{ ...raw, collection_items: null }]);
    expect((await fetchLiveCollections(db))[0]?.items).toEqual([]);
  });

  it("reads one live collection by slug and refuses a malformed slug without asking", async () => {
    const { db, calls } = stub([raw]);
    expect((await fetchCollectionBySlug(db, "calm-starts"))?.slug).toBe("calm-starts");
    expect(calls[0]?.eq).toEqual([
      ["slug", "calm-starts"],
      ["status", "live"],
    ]);
    expect(await fetchCollectionBySlug(db, "Calm Starts; drop")).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("returns null for a slug nobody has and throws on a database error", async () => {
    expect(await fetchCollectionBySlug(stub([]).db, "nothing-here")).toBeNull();
    await expect(fetchLiveCollections(stub([], { message: "boom" }).db)).rejects.toThrow("fetchLiveCollections: boom");
    await expect(fetchCollectionBySlug(stub([], { message: "boom" }).db, "x")).rejects.toThrow("fetchCollectionBySlug: boom");
  });
});
