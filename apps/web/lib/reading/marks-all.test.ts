import { describe, expect, it } from "vitest";
import { groupMarksByWorkbook, type Mark } from "./marks";

const mark = (id: string, ref: string, updatedAt: string): Mark => ({ id, ref, colour: "yellow", note: "", excerpt: "", updatedAt });

describe("groupMarksByWorkbook", () => {
  it("groups by enrolment and puts the most recently marked workbook first", () => {
    const out = groupMarksByWorkbook([
      { enrolmentId: "a", title: "Alpha", mark: mark("1", "unit:1#0", "2026-10-01T10:00:00Z") },
      { enrolmentId: "b", title: "Beta", mark: mark("2", "unit:1#0", "2026-10-05T10:00:00Z") },
      { enrolmentId: "a", title: "Alpha", mark: mark("3", "unit:2#0", "2026-10-02T10:00:00Z") },
    ]);
    expect(out.map((g) => g.enrolmentId)).toEqual(["b", "a"]);
    expect(out[1]?.marks).toHaveLength(2);
  });
  it("orders marks within a workbook by screen then paragraph, numerically", () => {
    const out = groupMarksByWorkbook([
      { enrolmentId: "a", title: "A", mark: mark("1", "unit:10#0", "2026-10-01T00:00:00Z") },
      { enrolmentId: "a", title: "A", mark: mark("2", "unit:2#3", "2026-10-01T00:00:00Z") },
      { enrolmentId: "a", title: "A", mark: mark("3", "unit:2#1", "2026-10-01T00:00:00Z") },
    ]);
    expect(out[0]?.marks.map((m) => m.id)).toEqual(["3", "2", "1"]);
  });
  it("returns nothing for no marks", () => {
    expect(groupMarksByWorkbook([])).toEqual([]);
  });
});
