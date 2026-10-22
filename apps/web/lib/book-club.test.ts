import { describe, expect, it } from "vitest";
import { DISCUSSION_PROMPTS, GROUND_RULES, bookClubEligible, defaultPerMeeting, meetingCount, meetingLabel, meetingPlan } from "./book-club";

const units = (n: number) => Array.from({ length: n }, (_, i) => ({ number: i + 1, focus: `Focus ${i + 1}` }));

describe("book club pages (14.16)", () => {
  it("lists only live, non-demo programmes with a first unit and no wellbeing tier", () => {
    expect(bookClubEligible({ isDemo: false, hasVersion: true, safetyTier: "none" })).toBe(true);
    expect(bookClubEligible({ isDemo: true, hasVersion: true, safetyTier: "none" })).toBe(false);
    expect(bookClubEligible({ isDemo: false, hasVersion: false, safetyTier: "none" })).toBe(false);
    expect(bookClubEligible({ isDemo: false, hasVersion: true, safetyTier: "standard" })).toBe(false);
    expect(bookClubEligible({ isDemo: false, hasVersion: true, safetyTier: "higher" })).toBe(false);
  });

  it("meets once a unit up to 8 units and twice a unit beyond", () => {
    expect(defaultPerMeeting(6)).toBe(1);
    expect(defaultPerMeeting(8)).toBe(1);
    expect(defaultPerMeeting(9)).toBe(2);
    expect(meetingPlan(units(6))).toHaveLength(6);
    expect(meetingPlan(units(12))).toHaveLength(6);
    expect(meetingPlan(units(9)).at(-1)?.units).toHaveLength(1);
  });

  it("keeps units in order and skips blank focus lines", () => {
    const plan = meetingPlan([{ number: 2, focus: "B" }, { number: 1, focus: "A" }, { number: 3, focus: "  " }]);
    expect(plan.map((m) => m.units[0]?.focus)).toEqual(["A", "B"]);
    expect(meetingPlan([])).toEqual([]);
  });

  it("labels meetings by their units", () => {
    const plan = meetingPlan(units(10));
    expect(meetingLabel(plan[0]!, "week")).toBe("Meeting 1: Weeks 1 and 2");
    expect(meetingLabel(meetingPlan(units(3))[2]!, "Day")).toBe("Meeting 3: Day 3");
    expect(meetingCount(1)).toBe("1 meeting");
    expect(meetingCount(6)).toBe("6 meetings");
  });

  it("never asks anyone to share an answer, and uses no dashes", () => {
    for (const s of [...DISCUSSION_PROMPTS, ...GROUND_RULES]) {
      expect(s).not.toMatch(/—|–/);
      expect(s).not.toMatch(/read out your answer|share your answer/i);
    }
    expect(GROUND_RULES.join(" ")).toMatch(/private/);
  });
});
