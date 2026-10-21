import { habitLanguageHits } from "@akana/validate";
import { describe, expect, it } from "vitest";
import { imageFileName, isMilestoneKind, MILESTONE_COPY, MILESTONE_KINDS, marksView } from "./milestones";

describe("marksView", () => {
  it("orders by scale, flags unseen marks and drops unknown kinds", () => {
    const rows = [
      { id: "3", kind: "first_programme", earned_at: "2026-10-03T00:00:00Z", seen_at: null },
      { id: "1", kind: "first_step", earned_at: "2026-10-01T00:00:00Z", seen_at: "2026-10-01T01:00:00Z" },
      { id: "x", kind: "something_else", earned_at: "2026-10-01T00:00:00Z", seen_at: null },
    ];
    const v = marksView(rows);
    expect(v.map((m) => m.kind)).toEqual(["first_step", "first_programme"]);
    expect(v.map((m) => m.isNew)).toEqual([false, true]);
  });
});

describe("kinds and copy", () => {
  it("has copy for every kind and recognises only those kinds", () => {
    for (const k of MILESTONE_KINDS) expect(MILESTONE_COPY[k].name.length).toBeGreaterThan(0);
    expect(isMilestoneKind("first_step")).toBe(true);
    expect(isMilestoneKind("first_month")).toBe(false);
    expect(isMilestoneKind(null)).toBe(false);
  });

  it("keeps the shared picture free of titles, answers, dates and habit language", () => {
    for (const k of MILESTONE_KINDS) {
      const c = MILESTONE_COPY[k];
      for (const text of [c.name, c.line, c.imageLine]) {
        expect(habitLanguageHits(text), text).toEqual([]);
        expect(text).not.toMatch(/[—!]|\d/);
      }
    }
  });

  it("names the saved picture by kind only", () => {
    expect(imageFileName("first_week")).toBe("akana-first-week.png");
  });
});
