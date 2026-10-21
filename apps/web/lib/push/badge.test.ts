import { describe, expect, it } from "vitest";
import { badgeCount } from "@/lib/push/badge";

describe("badgeCount", () => {
  it("is one while a step is waiting and none done today", () => {
    expect(badgeCount({ wellbeing: false, stepWaiting: true, finishedToday: false })).toBe(1);
  });
  it("clears once a step is done today, or when none is waiting", () => {
    expect(badgeCount({ wellbeing: false, stepWaiting: true, finishedToday: true })).toBe(0);
    expect(badgeCount({ wellbeing: false, stepWaiting: false, finishedToday: false })).toBe(0);
  });
  it("is always zero for readers with a wellbeing title", () => {
    expect(badgeCount({ wellbeing: true, stepWaiting: true, finishedToday: false })).toBe(0);
  });
});
