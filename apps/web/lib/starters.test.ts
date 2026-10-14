import { describe, expect, it } from "vitest";
import type { LibraryCard } from "@/lib/catalogue-types";
import { pickStarters } from "./starters";

const card = (over: Partial<LibraryCard>): LibraryCard =>
  ({ id: over.title ?? "x", code: "AK-AAAAA", slug: "s", title: "T", shortTitle: null, cardLine: "", genreId: "business", genreName: "Business", themeId: null, themeName: null, badge: "demo", isDemo: true, depth: "full", safetyTier: "none", authors: [], hasVersion: true, unitCount: 6, ...over }) as LibraryCard;

describe("pickStarters", () => {
  it("returns three titles from different shelves, shortest programmes first", () => {
    const out = pickStarters([
      card({ title: "A", genreId: "business", unitCount: 6 }),
      card({ title: "B", genreId: "business", unitCount: 4 }),
      card({ title: "C", genreId: "craft", unitCount: 8 }),
      card({ title: "D", genreId: "cooking", unitCount: 12 }),
    ]);
    expect(out.map((c) => c.title)).toEqual(["B", "C", "D"]);
  });
  it("never offers a mental health title or one with no published version", () => {
    const out = pickStarters([card({ title: "M", safetyTier: "standard" }), card({ title: "N", hasVersion: false }), card({ title: "O" })]);
    expect(out.map((c) => c.title)).toEqual(["O"]);
  });
  it("fills the rest from the same shelf when the shelves run out", () => {
    const out = pickStarters([card({ title: "A" }), card({ title: "B" }), card({ title: "C" })]);
    expect(out).toHaveLength(3);
  });
});
