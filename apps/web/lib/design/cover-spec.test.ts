import { describe, expect, it } from "vitest";
import { BAR_COUNT, COVER_FORMATS, barsFor, coverFormat, formatLabel, previewLine, shelfForCover, snapPngWidth, titleLines } from "./cover-spec";

describe("cover format code", () => {
  it("reads 4, 8 and 12 week programmes as one, two and three bars", () => {
    expect(coverFormat({ unitCount: 4, unitKind: "week" })).toBe("w4");
    expect(coverFormat({ unitCount: 8, unitKind: "week" })).toBe("w8");
    expect(coverFormat({ unitCount: 12, unitKind: "week" })).toBe("w12");
    expect([barsFor(1), barsFor(5), barsFor(6), barsFor(9), barsFor(10), barsFor(21)]).toEqual([1, 1, 2, 2, 3, 3]);
    expect(COVER_FORMATS.map((f) => BAR_COUNT[f])).toEqual([1, 2, 3, 0, 0]);
  });
  it("gives collections and Start here their own marks, and an unknown length a plain label", () => {
    expect(coverFormat({ collection: true })).toBe("collection");
    expect(coverFormat({ start: true, unitCount: 12 })).toBe("start");
    expect(formatLabel({ collection: true })).toBe("Collection");
    expect(formatLabel({ start: true })).toBe("Start here");
    expect(formatLabel({ unitCount: null })).toBe("Workbook");
  });
  it("says the real length, in the unit the listing uses", () => {
    expect(formatLabel({ unitCount: 12, unitKind: "week" })).toBe("12 weeks");
    expect(formatLabel({ unitCount: 1, unitKind: "day" })).toBe("1 day");
    expect(formatLabel({ unitCount: 21, unitKind: "day" })).toBe("21 days");
    expect(formatLabel({ unitCount: 7, unitKind: null })).toBe("7 weeks");
  });
});

describe("preview line", () => {
  it("is one short line cut on a word, with an ellipsis, and never invented", () => {
    expect(previewLine("Small steps back to steady ground")).toBe("Small steps back to steady ground");
    const long = previewLine("A calm, practical guide to rebuilding your routine after a hard season at work");
    expect(long.length).toBeLessThanOrEqual(46);
    expect(long.endsWith("…")).toBe(true);
    expect(long).not.toMatch(/\s…$/);
    expect(previewLine(null)).toBe("");
    expect(previewLine("  spaced   out  ")).toBe("spaced out");
  });
});

describe("shelf, title and size", () => {
  it("uses the Theme's shelf, else the genre's, else a default", () => {
    expect(shelfForCover("money", "wellbeing")).toBe("money");
    expect(shelfForCover(null, "wellbeing")).toBe("mind-and-mood");
    expect(shelfForCover("not-a-shelf", "finance")).toBe("money");
    expect(shelfForCover(null, null)).toBe("personal-growth");
  });
  it("wraps a title to three short lines", () => {
    expect(titleLines("Rebuilding from Empty").lines).toEqual(["Rebuilding", "from Empty"]);
    const t = titleLines("An Extraordinarily Long Title That Will Need Many More Lines Than There Is Room For");
    expect(t.lines).toHaveLength(3);
    expect(t.truncated).toBe(true);
    expect(t.lines[2]!.endsWith("…")).toBe(true);
  });
  it("snaps widths to four cached sizes", () => {
    expect([100, 120, 121, 300, 480, 9999].map(snapPngWidth)).toEqual([120, 120, 240, 360, 480, 480]);
  });
});
