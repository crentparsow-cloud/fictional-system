import { describe, expect, it } from "vitest";
import { HARDEST_CARD_INTERVAL_MS, hardestCardKey, sensitiveFieldKeys, shouldShowHardestCard } from "./hardest-answer";

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

  it("has no content marker to read yet, so nothing is sensitive", () => {
    expect(sensitiveFieldKeys({ exercises: [] }).size).toBe(0);
  });

  it("keys the weekly rule by enrolment", () => {
    expect(hardestCardKey("abc")).toBe("ak:hardest:abc");
  });
});
