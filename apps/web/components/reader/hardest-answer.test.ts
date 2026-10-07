import { describe, expect, it } from "vitest";
import type { WorkbookV3 } from "@akana/schema";
import { HARDEST_CARD_INTERVAL_MS, hardestCardKey, sensitiveFieldKeys, shouldShowHardestCard } from "./hardest-answer";

type Exercise = WorkbookV3["exercises"][number];

/** A minimal exercise: only id and fields matter to sensitiveFieldKeys. */
function exercise(id: string, fields: Array<{ id: string; sensitive?: boolean }>): Exercise {
  return { id, fields: fields.map((f) => ({ type: "long_text", label: f.id, ...f })) } as unknown as Exercise;
}

describe("hardest answer card (F-022)", () => {
  const sensitive = new Set(["exercise:ex_one.f_hard"]);
  const now = 1_800_000_000_000;

  it("shows only for a field marked sensitive", () => {
    expect(shouldShowHardestCard({ field: "exercise:ex_one.f_hard", sensitive, lastShownAt: null, now })).toBe(true);
    expect(shouldShowHardestCard({ field: "exercise:ex_one.f_other", sensitive, lastShownAt: null, now })).toBe(false);
  });

  it("shows at most once a week", () => {
    const f = "exercise:ex_one.f_hard";
    expect(shouldShowHardestCard({ field: f, sensitive, lastShownAt: now - 1000, now })).toBe(false);
    expect(shouldShowHardestCard({ field: f, sensitive, lastShownAt: now - HARDEST_CARD_INTERVAL_MS + 1, now })).toBe(false);
    expect(shouldShowHardestCard({ field: f, sensitive, lastShownAt: now - HARDEST_CARD_INTERVAL_MS, now })).toBe(true);
  });

  it("returns nothing when no field is marked", () => {
    expect(sensitiveFieldKeys({ exercises: [] }).size).toBe(0);
    const doc = { exercises: [exercise("ex_one", [{ id: "f_one" }, { id: "f_two", sensitive: false }])] };
    expect(sensitiveFieldKeys(doc).size).toBe(0);
  });

  it("returns the answer paths of fields marked sensitive, including the repeat scope", () => {
    const doc = {
      exercises: [
        exercise("ex_one", [{ id: "f_easy" }, { id: "f_hard", sensitive: true }]),
        exercise("ex_two", [{ id: "f_also", sensitive: true }]),
      ],
    };
    expect([...sensitiveFieldKeys(doc)].sort()).toEqual([
      "exercise:ex_one.f_hard",
      "exercise:ex_one~r.f_hard",
      "exercise:ex_two.f_also",
      "exercise:ex_two~r.f_also",
    ]);
    const keys = sensitiveFieldKeys(doc);
    const now = 1_800_000_000_000;
    expect(shouldShowHardestCard({ field: "exercise:ex_one.f_hard", sensitive: keys, lastShownAt: null, now })).toBe(true);
    expect(shouldShowHardestCard({ field: "exercise:ex_one.f_easy", sensitive: keys, lastShownAt: null, now })).toBe(false);
  });

  it("keys the weekly rule by enrolment", () => {
    expect(hardestCardKey("abc")).toBe("ak:hardest:abc");
  });
});
