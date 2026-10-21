import { describe, expect, it } from "vitest";
import { groupRequests, isRequestStatus, parseRequestFilter, type RequestRow } from "./title-requests";

function row(over: Partial<RequestRow> & Pick<RequestRow, "id" | "title_key">): RequestRow {
  return { created_at: "2026-10-01T10:00:00Z", title: over.title_key, author_name: null, note: null, status: "new", staff_note: null, ...over };
}

describe("parseRequestFilter and isRequestStatus", () => {
  it("accepts only the five statuses", () => {
    expect(parseRequestFilter("planned")).toBe("planned");
    expect(parseRequestFilter(["done", "new"])).toBe("done");
    expect(parseRequestFilter("anything")).toBeNull();
    expect(parseRequestFilter(undefined)).toBeNull();
    expect(isRequestStatus("declined")).toBe(true);
    expect(isRequestStatus("closed")).toBe(false);
  });
});

describe("groupRequests", () => {
  const rows: RequestRow[] = [
    row({ id: "1", title_key: "atomic habits", title: "Atomic Habits", author_name: "James Clear", created_at: "2026-10-03T10:00:00Z", note: "Loved it" }),
    row({ id: "2", title_key: "atomic habits", title: "atomic habits", created_at: "2026-10-04T10:00:00Z" }),
    row({ id: "3", title_key: "atomic habits", title: "Atomic Habits", author_name: "james clear", created_at: "2026-10-05T10:00:00Z" }),
    row({ id: "4", title_key: "deep work", title: "Deep Work", created_at: "2026-10-06T10:00:00Z" }),
    row({ id: "5", title_key: "meditations", title: "Meditations", created_at: "2026-10-02T10:00:00Z" }),
  ];

  it("counts the same title once, most asked first, then newest", () => {
    const g = groupRequests(rows);
    expect(g.map((x) => [x.key, x.count])).toEqual([
      ["atomic habits", 3],
      ["deep work", 1],
      ["meditations", 1],
    ]);
  });

  it("uses the most common wording, lists authors and notes, and keeps every id", () => {
    const g = groupRequests(rows)[0]!;
    expect(g.title).toBe("Atomic Habits");
    expect(g.authors).toEqual(["james clear", "James Clear"].sort((a, b) => (g.authors.indexOf(a) - g.authors.indexOf(b))));
    expect(g.notes).toEqual(["Loved it"]);
    expect(g.ids.sort()).toEqual(["1", "2", "3"]);
    expect(g.latest).toBe("2026-10-05T10:00:00Z");
  });

  it("reports one shared status, or mixed", () => {
    expect(groupRequests(rows)[0]?.status).toBe("new");
    const mixed = groupRequests([row({ id: "a", title_key: "k", status: "new" }), row({ id: "b", title_key: "k", status: "planned" })]);
    expect(mixed[0]?.status).toBe("mixed");
    expect(groupRequests([row({ id: "a", title_key: "k", status: "planned", staff_note: "Spring" })])[0]).toMatchObject({ status: "planned", staffNote: "Spring" });
  });

  it("handles no rows", () => {
    expect(groupRequests([])).toEqual([]);
  });
});
